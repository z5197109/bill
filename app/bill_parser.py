# bill_parser.py
# 模板驱动（类型识别 + 行号/锚点定位）账单解析器
# - 支持 templates.json / templates.yaml 外部配置
# - 支持 scope 切片，让“第几行”在不同截图里更稳定
# - 保留：OCR 单例 + 批处理流水线并行

import os
import re
import json
import tempfile
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, List, Dict, Any, Pattern, Tuple, Union, Callable

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None

from .ocr_engine import get_global_paddle_ocr_engine

# 如果你项目里有 config（CATEGORY_RULES / WEAK_KEYWORDS），会自动接入
try:
    import config  # noqa
except Exception:  # pragma: no cover
    class _DummyConfig:
        CATEGORY_RULES = {}
        WEAK_KEYWORDS = set()
    config = _DummyConfig()


# --------------------------- 基础正则/工具 ---------------------------

_MONEY_RE = re.compile(r"[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?")
_PHONE_MASK_RE = re.compile(r"\d{2,3}-\d{3}\*+\d{4}|\d{3}\*+\d{4}")
_DATE_RE = re.compile(r"\b20\d{2}[-/\.]\d{1,2}[-/\.]\d{1,2}\b")
_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}:\d{2}\b")


def _norm(s: str) -> str:
    return (
        (s or "")
        .replace("\u3000", " ")
        .replace("：", ":")
        .replace("（", "(")
        .replace("）", ")")
        .strip()
    )


def _compact(s: str) -> str:
    return (s or "").replace(" ", "").replace("\u3000", "").strip()


def _looks_like_datetime(s: str) -> bool:
    s = _norm(s)
    return bool(_DATE_RE.search(s) or _TIME_RE.search(s))


def _parse_all_money(text: str) -> List[float]:
    out: List[float] = []
    if not text:
        return out
    for m in _MONEY_RE.findall(text):
        try:
            out.append(float(m.replace(",", "")))
        except Exception:
            pass
    return out


def _pick_money(vals: List[float], mode: str) -> Optional[float]:
    if not vals:
        return None
    mode = (mode or "max_abs").lower()
    if mode == "first":
        return vals[0]
    if mode == "last":
        return vals[-1]
    if mode == "max":
        return max(vals)
    if mode == "min":
        return min(vals)
    if mode == "sum":
        return sum(vals)
    return max(vals, key=lambda x: abs(x))  # default max_abs


def _clean_item_text(s: str) -> str:
    """清洗商品名：去价格/数量/箭头/多余符号"""
    s = (s or "").strip()
    # 去右侧箭头/符号
    s = re.sub(r"[>›»]+$", "", s).strip()
    # 去价格片段（¥138 / ￥154 / 138元）
    s = re.sub(r"(¥|￥)\s*[-+]?\d+(?:\.\d+)?", "", s).strip()
    s = re.sub(r"[-+]?\d+(?:\.\d+)?\s*元$", "", s).strip()
    # 去数量 x1 / ×1
    s = re.sub(r"(\bx\s*\d+\b|×\d+)$", "", s, flags=re.I).strip()
    # 去两端分隔符
    s = s.strip(" -:：|丨")
    return s


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _load_templates_from_file(path: str) -> List[Dict[str, Any]]:
    """
    支持 JSON / YAML（YAML 需要 pyyaml）
    """
    if not path:
        return []
    if not os.path.exists(path):
        raise FileNotFoundError(f"templates_path not found: {path}")

    ext = os.path.splitext(path)[1].lower()
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()

    if ext == ".json":
        data = json.loads(txt)
        if not isinstance(data, list):
            raise ValueError("templates json must be a list")
        return data

    if ext in (".yml", ".yaml"):
        try:
            import yaml  # type: ignore
        except Exception as e:
            raise RuntimeError("YAML templates require `pyyaml` installed") from e
        data = yaml.safe_load(txt)
        if not isinstance(data, list):
            raise ValueError("templates yaml must be a list")
        return data

    raise ValueError("templates_path must be .json/.yml/.yaml")


# --------------------------- 模板结构 ---------------------------

@dataclass
class ScopeRule:
    """用于把 OCR 行列表切成“有效区域”，让行号更稳定"""
    start_after_any: List[str]
    start_at_any: List[str]
    end_before_any: List[str]
    drop_first: int = 0
    drop_last: int = 0


@dataclass
class LineRule:
    """
    行定位规则（支持：绝对行号 or 以 anchor 为基准的相对行号）
    - line: int 或 list[int]，支持负数（-1 表示最后一行）
    - anchor_any / anchor_regex: 找到锚点行后，以 offset 作为基准，再加 line
    - search_window: 在目标行附近 +-window 里选第一个合规行
    - join_next: 拼接后续 N 行（OCR 断行时有用）
    - clean: True 表示对 item 做清洗
    - require_regex: 必须匹配该 regex 才算候选
    - skip_contains: 如果行里包含这些词，就跳过（排除“云闪付< / 待发货 / 地址 / 服务保障”等）
    """
    line: Union[int, List[int]]
    search_window: int = 0
    join_next: int = 0
    clean: bool = True

    anchor_any: Optional[List[str]] = None
    anchor_regex: Optional[Pattern[str]] = None
    offset: int = 0

    require_regex: Optional[Pattern[str]] = None
    skip_contains: Optional[List[str]] = None
    skip_datetime_phone: bool = False


@dataclass
class AmountRule(LineRule):
    money_pick: str = "max_abs"  # first/last/max_abs/max/min/sum
    abs_value: bool = True
    round_ndigits: int = 2


@dataclass
class ExtraOCRSpec:
    """
    ROI 二次 OCR 配置（模板可配）：
    - roi: 相对坐标 {x,y,w,h}，范围 0~1
    - append: True 追加到末尾；False 插入到开头
    - scale: ROI 放大倍数（提升小字识别）
    - add_marker: 是否插 marker 行：__ROI__{name}__
    """
    name: str
    roi: Dict[str, float]
    append: bool = True
    scale: float = 2.0
    add_marker: bool = True



@dataclass
class TemplateMatcher:
    contains_all: List[str]
    contains_any: List[str]
    regex_any: List[Pattern[str]]
    not_contains: List[str]
    min_score: int = 0


@dataclass
class BillTemplate:
    name: str
    priority: int
    matcher: TemplateMatcher
    scope: ScopeRule
    item_rule: Optional[LineRule]
    amount_rule: Optional[AmountRule]
    payee_rule: Optional[LineRule]

    # ✅ 新增：ROI 二次 OCR 配置
    extra_ocr: List[ExtraOCRSpec] = field(default_factory=list)



def _compile_scope(obj: Any) -> ScopeRule:
    obj = obj or {}
    return ScopeRule(
        start_after_any=list(obj.get("start_after_any", []) or []),
        start_at_any=list(obj.get("start_at_any", []) or []),
        end_before_any=list(obj.get("end_before_any", []) or []),
        drop_first=_safe_int(obj.get("drop_first", 0), 0),
        drop_last=_safe_int(obj.get("drop_last", 0), 0),
    )


def _compile_template(d: Dict[str, Any]) -> BillTemplate:
    name = d.get("name") or "unnamed"
    priority = _safe_int(d.get("priority", 0), 0)

    m = d.get("match", {}) or {}
    contains_all = list(m.get("all", []) or [])
    contains_any = list(m.get("any", []) or [])
    not_contains = list(m.get("not", []) or [])

    regex_any_raw = list(m.get("regex_any", []) or [])
    regex_any: List[Pattern[str]] = []
    for r in regex_any_raw:
        try:
            regex_any.append(re.compile(r))
        except Exception:
            pass

    min_score = _safe_int(m.get("min_score", 0), 0)

    matcher = TemplateMatcher(
        contains_all=contains_all,
        contains_any=contains_any,
        regex_any=regex_any,
        not_contains=not_contains,
        min_score=min_score,
    )

    scope = _compile_scope(d.get("scope"))

    def _compile_line_rule(obj: Any, is_amount: bool = False):
        if not obj:
            return None

        line = obj.get("line", 0)
        if isinstance(line, list):
            line = [int(x) for x in line]
        else:
            line = int(line)

        search_window = _safe_int(obj.get("search_window", 0), 0)
        join_next = _safe_int(obj.get("join_next", 0), 0)
        clean = bool(obj.get("clean", True))
        skip_dt_phone = bool(obj.get("skip_datetime_phone", False))

        # anchor
        anchor_any = obj.get("anchor_any")
        if anchor_any is not None:
            anchor_any = list(anchor_any or [])

        anchor_regex = obj.get("anchor_regex")
        anchor_pat = None
        if anchor_regex:
            try:
                anchor_pat = re.compile(anchor_regex)
            except Exception:
                anchor_pat = None

        offset = _safe_int(obj.get("offset", 0), 0)

        require_regex = obj.get("require_regex")
        require_pat = None
        if require_regex:
            try:
                require_pat = re.compile(require_regex)
            except Exception:
                require_pat = None

        skip_contains = obj.get("skip_contains")
        if skip_contains is not None:
            skip_contains = list(skip_contains or [])

        if is_amount:
            return AmountRule(
                line=line,
                search_window=search_window,
                join_next=join_next,
                clean=False,  # 金额不做 clean
                anchor_any=anchor_any,
                anchor_regex=anchor_pat,
                offset=offset,
                require_regex=require_pat,
                skip_contains=skip_contains,
                skip_datetime_phone=skip_dt_phone,
                money_pick=str(obj.get("money_pick", "max_abs")),
                abs_value=bool(obj.get("abs", True)),
                round_ndigits=_safe_int(obj.get("round", 2), 2),
            )

        return LineRule(
            line=line,
            search_window=search_window,
            join_next=join_next,
            clean=clean,
            anchor_any=anchor_any,
            anchor_regex=anchor_pat,
            offset=offset,
            require_regex=require_pat,
            skip_contains=skip_contains,
            skip_datetime_phone=skip_dt_phone,
        )

    ex = d.get("extract", {}) or {}
    item_rule = _compile_line_rule(ex.get("item") or d.get("item"), is_amount=False)
    amount_rule = _compile_line_rule(ex.get("amount") or d.get("amount"), is_amount=True)
    payee_rule = _compile_line_rule(ex.get("payee") or d.get("payee"), is_amount=False)

    # ✅ extra_ocr 支持：可写在模板根 or extract 内
    extra_specs: List[ExtraOCRSpec] = []
    extra_raw = d.get("extra_ocr") or (d.get("extract", {}) or {}).get("extra_ocr") or []
    if isinstance(extra_raw, list):
        for it in extra_raw:
            try:
                it = it or {}
                roi = it.get("roi") or {}
                extra_specs.append(
                    ExtraOCRSpec(
                        name=str(it.get("name") or "roi"),
                        roi={
                            "x": float(roi.get("x", 0)),
                            "y": float(roi.get("y", 0)),
                            "w": float(roi.get("w", 1)),
                            "h": float(roi.get("h", 1)),
                        },
                        append=bool(it.get("append", True)),
                        scale=float(it.get("scale", 2.0)),
                        add_marker=bool(it.get("add_marker", True)),
                    )
                )
            except Exception:
                continue

    return BillTemplate(
        name=name,
        priority=priority,
        matcher=matcher,
        scope=scope,
        item_rule=item_rule,
        amount_rule=amount_rule,
        payee_rule=payee_rule,
        extra_ocr=extra_specs,
    )



# --------------------------- 默认模板（包含你图一这种） ---------------------------

DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    {
        # ✅ 适配图一：云闪付订单详情页（待发货 + 百亿补贴官方精选 + 实付款）
        "name": "yunshanfu_pending_ship_order_detail",
        "priority": 100,
        "match": {
            "any": ["待发货", "百亿补贴官方精选", "实付款"],
            "min_score": 1,
        },
        # ✅ 关键：把行列表切到“商品区块”，避免把“云闪付< / 地址 / 待发货”当商品
        "scope": {
            "start_after_any": ["百亿补贴官方精选"],
            "end_before_any": ["订单信息"],  # 订单信息之后都是噪声，对商品/金额无用
            "drop_first": 0,
            "drop_last": 0,
        },
        "extract": {
            # 商品名：一般是 scope 后第一行（含商品标题，有时同一行带价格，clean 会去掉）
            "item": {
                "line": 0,
                "search_window": 2,
                "join_next": 0,
                "clean": True,
                "skip_contains": [
                    "待发货", "后天", "号码保护", "服务保障", "申请开票",
                    "商品总价", "运费", "店铺优惠", "平台优惠", "共减", "实付款",
                    "退货宝", "极速退款", "退款",
                ],
            },
            # 金额：用锚点“实付款”定位该行并抽金额（比“第几行”更稳，但仍是配置化定位）
            "amount": {
                "anchor_any": ["实付款"],
                "offset": 0,
                "line": 0,
                "search_window": 1,
                "require_regex": r"(¥|￥)\s*\d",
                "money_pick": "max_abs",
                "abs": True,
                "round": 2,
            },
            # payee 可不配；云闪付订单页里不一定能稳定拿到收款方
        },
    },
    {
        # 兜底模板：无论什么都能出结果
        "name": "fallback_by_position",
        "priority": 0,
        "match": {"min_score": 0},
        "scope": {},  # 不切片
        "extract": {
            "item": {
                "line": [0, 1, 2, 3],
                "search_window": 2,
                "join_next": 1,
                "clean": True,
                "skip_contains": ["云闪付", "返回", "待发货", "号码保护", "订单信息"],
            },
            "amount": {
                "line": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                "search_window": 2,
                "require_regex": r"(¥|￥)\s*\d",
                "money_pick": "max_abs",
                "abs": True,
                "round": 2,
            },
        }
    }
]


# --------------------------- 解析器主体 ---------------------------

class BillParser:
    """账单解析器：并行预处理 + 全局单实例OCR队列 + 模板驱动解析"""

    def __init__(
        self,
        max_side: int = 1280,
        jpeg_quality: int = 80,
        use_gpu: bool = True,
        cpu_threads: int = 6,
        pool_workers: int = 8,
        create_executor: bool = True,
        ocr_timeout: float | None = None,
        templates: Optional[List[Dict[str, Any]]] = None,
        templates_path: Optional[str] = None,
        debug: bool = False,
        category_rules_loader: Optional[Callable[[], List[Any]]] = None,
    ):
        self.max_side = max_side
        self.jpeg_quality = jpeg_quality
        self.use_gpu = use_gpu
        self.cpu_threads = cpu_threads
        self.pool_workers = pool_workers
        self.ocr_timeout = ocr_timeout
        self.debug = debug

        self.ocr_engine = get_global_paddle_ocr_engine(
            use_gpu=use_gpu,
            lang="ch",
            use_angle_cls=False,
            cpu_threads=cpu_threads,
            warmup=False,
        )

        self._executor = None
        if create_executor:
            self._executor = ThreadPoolExecutor(
                max_workers=self.pool_workers,
                thread_name_prefix="bill_cpu",
            )

        # 模板加载：优先 templates_path，再 templates，再默认
        if templates_path:
            raw_templates = _load_templates_from_file(templates_path)
        elif templates is not None:
            raw_templates = templates
        else:
            raw_templates = DEFAULT_TEMPLATES

        self.templates: List[BillTemplate] = [_compile_template(x) for x in raw_templates]
        self.templates.sort(key=lambda t: t.priority, reverse=True)
        self.category_rules_loader = category_rules_loader

    def shutdown(self):
        if self._executor is not None:
            self._executor.shutdown(wait=False)

    # ----------------------- 预处理 -----------------------
    def _preprocess_image(self, image_path: str) -> tuple[str, bool]:
        if Image is None:
            return image_path, False

        try:
            with Image.open(image_path) as img:
                if ImageOps is not None:
                    img = ImageOps.exif_transpose(img)

                w, h = img.size
                m = max(w, h)
                if m <= self.max_side:
                    return image_path, False

                scale = self.max_side / m
                new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
                resized = img.resize(new_size, Image.BILINEAR)

                fd, temp_path = tempfile.mkstemp(suffix=".jpg", prefix="bill_opt_")
                os.close(fd)
                resized.convert("RGB").save(
                    temp_path,
                    format="JPEG",
                    quality=self.jpeg_quality,
                    optimize=False,
                )
                return temp_path, True
        except Exception:
            return image_path, False

    # ----------------------- 单张 -----------------------
    def parse(self, image_path: str) -> dict:
        processed_path, is_temp = self._preprocess_image(image_path)
        try:
            ocr_lines = self.ocr_engine.run(processed_path, timeout=self.ocr_timeout)
            text_lines = [_norm(x.text) for x in ocr_lines if _norm(x.text)]
            return self._parse_text_lines(text_lines, image_path=processed_path)

        except Exception as exc:
            return {
                "merchant": "未知商品",
                "payee": "未知收款方",
                "amount": 0.0,
                "category": "未分类",
                "raw_text": [],
                "error": str(exc),
            }
        finally:
            if is_temp:
                try:
                    os.remove(processed_path)
                except OSError:
                    pass

    # ----------------------- 批量（流水线） -----------------------
    def parse_batch(self, image_paths) -> list[dict]:
        paths = list(image_paths)
        if not paths:
            return []

        if self._executor is None:
            self._executor = ThreadPoolExecutor(
                max_workers=self.pool_workers,
                thread_name_prefix="bill_cpu",
            )

        # 1) 并行预处理
        pre_fut_to_idx = {self._executor.submit(self._preprocess_image, p): i for i, p in enumerate(paths)}
        processed: list[tuple[str, bool]] = [("", False)] * len(paths)
        for fut in as_completed(pre_fut_to_idx):
            i = pre_fut_to_idx[fut]
            try:
                processed[i] = fut.result()
            except Exception:
                processed[i] = (paths[i], False)

        # 2) submit OCR（不占用 CPU 线程池）
        ocr_futs = [self.ocr_engine.submit(pp) for (pp, _) in processed]

        # 3) 并行后处理
        def _post(i: int) -> dict:
            ocr_lines = ocr_futs[i].result(timeout=self.ocr_timeout)
            text_lines = [_norm(x.text) for x in ocr_lines if _norm(x.text)]
            pp, _ = processed[i]
            return self._parse_text_lines(text_lines, image_path=pp)


        post_fut_to_idx = {self._executor.submit(_post, i): i for i in range(len(paths))}
        results: list[dict] = [None] * len(paths)

        for fut in as_completed(post_fut_to_idx):
            i = post_fut_to_idx[fut]
            try:
                results[i] = fut.result()
            except Exception as exc:
                results[i] = {
                    "merchant": "未知商品",
                    "payee": "未知收款方",
                    "amount": 0.0,
                    "category": "未分类",
                    "raw_text": [],
                    "error": str(exc),
                }

        # 4) 清理临时文件
        for pp, is_temp in processed:
            if is_temp:
                try:
                    os.remove(pp)
                except OSError:
                    pass

        return results

    # ----------------------- 模板匹配 -----------------------
    def _match_template(self, lines: List[str]) -> Tuple[BillTemplate, Dict[str, Any]]:
        content = "\n".join(lines)

        best_t: Optional[BillTemplate] = None
        best_score = -10**9
        best_dbg: Dict[str, Any] = {}

        for t in self.templates:
            m = t.matcher

            # not_contains 一票否决
            if any(x and x in content for x in m.not_contains):
                continue

            # contains_all 必须满足
            if m.contains_all and (not all(x and x in content for x in m.contains_all)):
                continue

            hit_any = [x for x in m.contains_any if x and x in content]

            hit_regex = 0
            for rp in m.regex_any:
                try:
                    if rp.search(content):
                        hit_regex += 1
                except Exception:
                    pass

            # ✅ 关键修复：模板声明了 any/regex_any 时，必须至少命中一个
            has_any_or_regex = bool(m.contains_any or m.regex_any)
            if has_any_or_regex and (not hit_any) and hit_regex == 0:
                continue

            score = 0
            score += len(hit_any) * 10
            score += len(m.contains_all) * 5
            score += hit_regex * 8
            score += t.priority

            if score < m.min_score:
                continue

            if score > best_score:
                best_score = score
                best_t = t
                best_dbg = {"score": score, "hit_any": hit_any, "hit_all": m.contains_all, "hit_regex": hit_regex}

        if best_t is None:
            best_t = self.templates[-1]
            best_dbg = {"score": 0, "hit_any": [], "hit_all": [], "hit_regex": 0}

        return best_t, best_dbg


    # ----------------------- scope 切片 -----------------------
    def _apply_scope(self, lines: List[str], scope: ScopeRule) -> Tuple[List[str], List[int]]:
        n = len(lines)
        idx_map = list(range(n))

        start = 0
        end = n

        # start_at_any 优先
        if scope.start_at_any:
            for i, s in enumerate(lines):
                if any(k in s for k in scope.start_at_any):
                    start = i
                    break

        # start_after_any
        if scope.start_after_any:
            for i, s in enumerate(lines):
                if i < start:
                    continue
                if any(k in s for k in scope.start_after_any):
                    start = i + 1
                    break

        # end_before_any
        if scope.end_before_any:
            for i in range(start, n):
                if any(k in lines[i] for k in scope.end_before_any):
                    end = i
                    break

        start = min(max(start + scope.drop_first, 0), n)
        end = max(min(end - scope.drop_last, n), start)

        scoped = lines[start:end]
        scoped_map = idx_map[start:end]
        return scoped, scoped_map
    

    def _run_extra_ocr(self, image_path: str, specs: List[ExtraOCRSpec]) -> List[str]:
        """
        对模板配置的 ROI 区域做二次 OCR，并把识别文本变成“附加行”：
        - 默认在每个 ROI chunk 前插入 marker：__ROI__{name}__
        - 可配置 append（追加/插入）与 scale（放大倍数）
        """
        if not specs or Image is None or not image_path:
            return []

        # PIL 新旧版本兼容的 resample 常量
        resample = getattr(getattr(Image, "Resampling", Image), "BILINEAR", Image.BILINEAR)

        out: List[str] = []
        try:
            with Image.open(image_path) as img:
                if ImageOps is not None:
                    img = ImageOps.exif_transpose(img)

                W, H = img.size

                for sp in specs:
                    roi = sp.roi or {}
                    x = float(roi.get("x", 0))
                    y = float(roi.get("y", 0))
                    w = float(roi.get("w", 1))
                    h = float(roi.get("h", 1))

                    left = int(max(0, min(W, x * W)))
                    top = int(max(0, min(H, y * H)))
                    right = int(max(0, min(W, (x + w) * W)))
                    bottom = int(max(0, min(H, (y + h) * H)))

                    if right - left < 5 or bottom - top < 5:
                        continue

                    crop = img.crop((left, top, right, bottom))

                    # 放大 ROI（对小字/蓝底白字特别有用）
                    if sp.scale and sp.scale > 1.0:
                        nw = max(1, int(crop.size[0] * sp.scale))
                        nh = max(1, int(crop.size[1] * sp.scale))
                        crop = crop.resize((nw, nh), resample=resample)

                    fd, tmp = tempfile.mkstemp(suffix=".jpg", prefix=f"bill_roi_{sp.name}_")
                    os.close(fd)
                    try:
                        crop.convert("RGB").save(tmp, format="JPEG", quality=90, optimize=False)
                        roi_lines = self.ocr_engine.run(tmp, timeout=self.ocr_timeout)
                        roi_texts = [_norm(x.text) for x in roi_lines if _norm(x.text)]

                        chunk: List[str] = []
                        if sp.add_marker:
                            chunk.append(f"__ROI__{sp.name}__")
                        chunk.extend(roi_texts)

                        if sp.append:
                            out.extend(chunk)
                        else:
                            out = chunk + out
                    finally:
                        try:
                            os.remove(tmp)
                        except OSError:
                            pass

        except Exception:
            return out

        return out


    def _load_category_rules(self) -> List[Dict[str, Any]]:
        """
        Load category rules from provided loader (DB) or fallback to config.
        """
        rules: List[Dict[str, Any]] = []
        loader = getattr(self, "category_rules_loader", None)

        if loader:
            try:
                raw_rules = loader() or []
                for r in raw_rules:
                    if isinstance(r, dict):
                        kw = r.get("keyword")
                        cat = r.get("category")
                        pr = r.get("priority", 0)
                        is_weak = bool(r.get("is_weak"))
                    else:
                        kw = getattr(r, "keyword", None)
                        cat = getattr(r, "category", None)
                        pr = getattr(r, "priority", 0)
                        is_weak = bool(getattr(r, "is_weak", False))
                    if kw and cat:
                        rules.append({
                            "keyword": str(kw),
                            "category": str(cat),
                            "priority": int(pr or 0),
                            "is_weak": is_weak,
                        })
            except Exception:
                rules = []

        if not rules:
            weak_keys = set(getattr(config, "WEAK_KEYWORDS", set()) or [])
            for key, cat in getattr(config, "CATEGORY_RULES", {}).items():
                if not key or cat is None:
                    continue
                rules.append({
                    "keyword": str(key),
                    "category": str(cat),
                    "priority": 1,
                    "is_weak": key in weak_keys,
                })

        rules.sort(key=lambda r: (int(r.get("priority") or 0) * 2 + (0 if r.get("is_weak") else 1)), reverse=True)
        return rules

    def _resolve_category(self, merchant: str, payee: str, text_lines: List[str]) -> str:
        rules = self._load_category_rules()
        best_category = None
        best_score = -1
        haystacks = [merchant, payee] + (text_lines or [])

        for text in haystacks:
            if not text:
                continue
            for rule in rules:
                kw = rule.get("keyword")
                if kw and kw in text:
                    score = int(rule.get("priority") or 0) * 2 + (0 if rule.get("is_weak") else 1)
                    if score > best_score:
                        best_score = score
                        best_category = rule.get("category")

        return best_category or "未分类"


    # ----------------------- 行抽取 -----------------------
    def _select_line_index(self, n: int, idx: int) -> Optional[int]:
        if n <= 0:
            return None
        if idx < 0:
            idx = n + idx
        if 0 <= idx < n:
            return idx
        return None

    def _is_skippable(self, s: str, rule: LineRule) -> bool:
        if not s:
            return True
        if rule.skip_datetime_phone:
            if _looks_like_datetime(s):
                return True
            if _PHONE_MASK_RE.search(_compact(s)):
                return True
        if rule.skip_contains:
            ss = _compact(s)
            if any(k and k in ss for k in rule.skip_contains):
                return True
        return False

    def _find_anchor_base(self, lines: List[str], rule: LineRule) -> int:
        if not lines:
            return 0
        if rule.anchor_any:
            for i, s in enumerate(lines):
                if any(k in s for k in (rule.anchor_any or [])):
                    return i + rule.offset
        if rule.anchor_regex is not None:
            for i, s in enumerate(lines):
                try:
                    if rule.anchor_regex.search(s):
                        return i + rule.offset
                except Exception:
                    pass
        return 0

    def _extract_by_rule(self, lines: List[str], rule: LineRule) -> Tuple[Optional[str], Optional[int]]:
        if not rule or not lines:
            return None, None

        n = len(lines)
        base = self._find_anchor_base(lines, rule)

        # 生成候选行号（相对 base）
        raw_candidates: List[int] = []
        if isinstance(rule.line, list):
            raw_candidates = [base + int(x) for x in rule.line]
        else:
            raw_candidates = [base + int(rule.line)]

        # 过滤越界，并展开 search_window
        def nearby(idx: int, w: int) -> List[int]:
            if w <= 0:
                return [idx]
            out = [idx]
            for d in range(1, w + 1):
                out.append(idx + d)
                out.append(idx - d)
            return out

        for cand in raw_candidates:
            si = self._select_line_index(n, cand)
            if si is None:
                continue

            for j in nearby(si, rule.search_window):
                jj = self._select_line_index(n, j)
                if jj is None:
                    continue

                s = lines[jj]
                if self._is_skippable(s, rule):
                    continue

                if rule.require_regex is not None:
                    try:
                        if not rule.require_regex.search(s):
                            continue
                    except Exception:
                        continue

                text = s

                # join_next 拼接后续行
                if rule.join_next and rule.join_next > 0:
                    parts = [text]
                    for k in range(1, rule.join_next + 1):
                        if jj + k >= n:
                            break
                        nxt = lines[jj + k]
                        if self._is_skippable(nxt, rule):
                            continue
                        parts.append(nxt)
                    text = "".join(parts)

                text = _norm(text)
                if rule.clean:
                    text = _clean_item_text(text)

                return (text if text else None), jj

        return None, None

    # ----------------------- 字段抽取 -----------------------
    def _extract_item(self, scoped_lines: List[str], t: BillTemplate) -> Tuple[str, Dict[str, Any]]:
        if t.item_rule is None:
            return "未知商品", {"line": None}
        text, idx = self._extract_by_rule(scoped_lines, t.item_rule)
        return (text or "未知商品"), {"line": idx}

    def _extract_payee(self, scoped_lines: List[str], t: BillTemplate) -> Tuple[str, Dict[str, Any]]:
        if t.payee_rule is None:
            return "未知收款方", {"line": None}
        text, idx = self._extract_by_rule(scoped_lines, t.payee_rule)
        return (text or "未知收款方"), {"line": idx}

    def _extract_amount(self, scoped_lines: List[str], t: BillTemplate) -> Tuple[float, Dict[str, Any]]:
        if t.amount_rule is None:
            return 0.0, {"line": None}

        text, idx = self._extract_by_rule(scoped_lines, t.amount_rule)
        if not text:
            return 0.0, {"line": None}

        vals = _parse_all_money(text.replace("¥", "").replace("￥", ""))
        v = _pick_money(vals, t.amount_rule.money_pick)
        if v is None:
            return 0.0, {"line": idx}

        if t.amount_rule.abs_value:
            v = abs(v)

        return float(round(v, t.amount_rule.round_ndigits)), {"line": idx}

    # ----------------------- 解析入口 -----------------------
    def _parse_text_lines(self, text_lines: List[str], image_path: Optional[str] = None) -> dict:
        # 1) 匹配模板（用全量行，避免 scope 切掉关键特征）
        t, mdbg = self._match_template(text_lines)

        # 1.5) ✅ extra_ocr：ROI 二次识别并把文本注入行列表
        extra_lines: List[str] = []
        try:
            if image_path and t.extra_ocr:
                extra_lines = self._run_extra_ocr(image_path, t.extra_ocr)
                if extra_lines:
                    text_lines = text_lines + extra_lines
        except Exception:
            extra_lines = []

        # 2) scope 切片（用于稳定行号）
        scoped_lines, scoped_map = self._apply_scope(text_lines, t.scope)

        # 3) 抽字段（在 scoped_lines 上）
        item, item_dbg = self._extract_item(scoped_lines, t)
        payee, payee_dbg = self._extract_payee(scoped_lines, t)
        amount, amt_dbg = self._extract_amount(scoped_lines, t)

        # 4) 映射回原始行号（用于 debug）
        def _map_idx(idx: Optional[int]) -> Optional[int]:
            if idx is None:
                return None
            if 0 <= idx < len(scoped_map):
                return scoped_map[idx]
            return None

        category = self._resolve_category(item, payee, text_lines)
        data = {
            "merchant": item,               # ✅ 商品名
            "payee": payee,                 # 可选
            "amount": amount,
            "category": category,
            "raw_text": text_lines,
            "_template": t.name,
        }

        if self.debug:
            data["_debug"] = {
                "match": mdbg,
                "scope": {
                    "scoped_len": len(scoped_lines),
                    "scoped_to_raw_map": scoped_map,
                },
                "item": {"scoped_line": item_dbg.get("line"), "raw_line": _map_idx(item_dbg.get("line"))},
                "amount": {"scoped_line": amt_dbg.get("line"), "raw_line": _map_idx(amt_dbg.get("line"))},
                "payee": {"scoped_line": payee_dbg.get("line"), "raw_line": _map_idx(payee_dbg.get("line"))},
                "indexed_lines": [{"i": i, "text": s} for i, s in enumerate(text_lines)],
                "indexed_scoped_lines": [{"i": i, "raw_i": scoped_map[i], "text": s} for i, s in enumerate(scoped_lines)],
            }
            if extra_lines:
                data["_debug"]["extra_ocr_lines"] = extra_lines

        return data