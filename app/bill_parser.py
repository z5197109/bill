# bill_parser.py
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
except ImportError:
    Image = None

from .ocr_engine import get_global_paddle_ocr_engine
import config


# bill_parser.py（在 BillParser 类里新增这些 helper）
import re
from typing import Optional, Tuple, List

_MONEY_STRICT_RE = re.compile(r"^\s*[-+]?\s*(?:¥|￥)?\s*[\d,]+(?:\.\d{1,2})?\s*$")
_MONEY_RE = re.compile(r"[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?")
_PHONE_MASK_RE = re.compile(r"\d{2,3}-\d{3}\*+\d{4}|\d{3}\*+\d{4}")
_DATE_RE = re.compile(r"\b20\d{2}[-/\.]\d{1,2}[-/\.]\d{1,2}\b")
_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}:\d{2}\b")


def _norm(s: str) -> str:
    # 统一一些常见符号/空白
    return (
        (s or "")
        .replace("\u3000", " ")
        .replace("：", ":")
        .replace("（", "(").replace("）", ")")
        .strip()
    )


def _looks_like_datetime(line: str) -> bool:
    l = _norm(line)
    return bool(_DATE_RE.search(l) or _TIME_RE.search(l))


def _parse_money_from_text(text: str) -> Optional[float]:
    """从一段文本里提取第一个金额（支持 -2,032.92 / ￥138 / 2036.00）"""
    if not text:
        return None
    t = _norm(text).replace(" ", "")
    m = _MONEY_RE.search(t)
    if not m:
        return None
    num = m.group(0)
    num = (
        num.replace("¥", "")
        .replace("￥", "")
        .replace(",", "")
        .replace(" ", "")
    )
    try:
        return float(num)
    except Exception:
        return None


def _extract_kv(text_lines: List[str], key: str) -> Optional[str]:
    """
    OCR 是“行”列表：支持
    - 同行： '订单金额 2036.00'
    - 下一行： '商品说明' 下一行是具体内容
    """
    for i, line in enumerate(text_lines):
        l = _norm(line)
        if key in l:
            after = l.split(key, 1)[1].strip(" :：\t")
            if after:
                return after
            if i + 1 < len(text_lines):
                nxt = _norm(text_lines[i + 1])
                return nxt if nxt else None
    return None


def _extract_product_keywords(desc: str) -> List[str]:
    """
    从商品说明里拆关键词：
    - 用 | / - / 空格 / 中文分隔符拆
    - 保留：中文>=2 或 类似 A8927 这种字母数字
    """
    if not desc:
        return []
    s = _norm(desc)
    parts = re.split(r"[|｜丨/、,\s\-—_]+", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # 过滤过短无意义
        if len(p) >= 2 and re.search(r"[\u4e00-\u9fff]", p):
            out.append(p)
            continue
        if re.fullmatch(r"[A-Za-z0-9]{3,}", p):
            out.append(p)
            continue
        # “第8期账单”这种
        if re.search(r"第\d+期", p) or "账单" in p:
            out.append(p)
    # 去重但保序
    seen = set()
    uniq = []
    for x in out:
        if x not in seen:
            uniq.append(x)
            seen.add(x)
    return uniq


def _pick_best_standalone_amount(text_lines: List[str]) -> Optional[float]:
    """
    找像 '-2,032.92' 这种“几乎只有金额”的行（通常就是账单详情页大号金额）。
    """
    best = None
    best_score = -1

    for i, line in enumerate(text_lines):
        l = _norm(line)
        if not l or _looks_like_datetime(l):
            continue
        if not _MONEY_STRICT_RE.match(l.replace(" ", "")):
            continue

        val = _parse_money_from_text(l)
        if val is None:
            continue

        score = 0
        if "-" in l or "+" in l:
            score += 3
        if "," in l:
            score += 2
        if abs(val) >= 1000:
            score += 2
        # 邻近“交易成功/交易完成”加分（账单详情页常见）
        near = " ".join(text_lines[max(0, i-2): min(len(text_lines), i+3)])
        if "交易成功" in near or "交易完成" in near:
            score += 2

        if score > best_score:
            best_score = score
            best = val

    return best


class BillParser:
    """账单解析器：并行预处理 + 全局单实例OCR队列 + 并行后处理"""

    def __init__(
        self,
        max_side: int = 1280,
        jpeg_quality: int = 80,
        use_gpu: bool = True,
        cpu_threads: int = 6,
        pool_workers: int = 8,
        create_executor: bool = True,
        ocr_timeout: float | None = None,
    ):
        self.max_side = max_side
        self.jpeg_quality = jpeg_quality
        self.use_gpu = use_gpu
        self.cpu_threads = cpu_threads
        self.pool_workers = pool_workers
        self.ocr_timeout = ocr_timeout

        # ✅ 全局单例OCR（单 worker 线程，队列串行推理）
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

    def shutdown(self):
        """释放CPU线程池（OCR引擎是全局单例，由 atexit 管）"""
        if self._executor is not None:
            self._executor.shutdown(wait=False)

    # ----------------------- 预处理 -----------------------
    def _preprocess_image(self, image_path: str) -> tuple[str, bool]:
        """
        返回：(processed_path, is_temp_file)
        - 只有当图片最大边 > max_side 时才生成临时压缩图
        """
        if Image is None:
            return image_path, False

        try:
            with Image.open(image_path) as img:
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


    # ----------------------- 单张（同步） -----------------------
    def parse(self, image_path: str) -> dict:
        processed_path, is_temp = self._preprocess_image(image_path)
        try:
            ocr_lines = self.ocr_engine.run(processed_path, timeout=self.ocr_timeout)
            text_lines = [x.text for x in ocr_lines]
            return self._parse_text_lines(text_lines)
        except Exception as exc:
            return {
                "merchant": "未知商户",
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

    # ----------------------- 批量（流水线优化） -----------------------
    def parse_batch(self, image_paths) -> list[dict]:
        paths = list(image_paths)
        if not paths:
            return []

        if self._executor is None:
            self._executor = ThreadPoolExecutor(max_workers=self.pool_workers, thread_name_prefix="bill_cpu")

        # 1) 并行预处理
        pre_fut_to_idx = {
            self._executor.submit(self._preprocess_image, p): i
            for i, p in enumerate(paths)
        }

        processed: list[tuple[str, bool]] = [("", False)] * len(paths)
        for fut in as_completed(pre_fut_to_idx):
            i = pre_fut_to_idx[fut]
            try:
                processed[i] = fut.result()
            except Exception:
                processed[i] = (paths[i], False)

        # 2) 批量 submit OCR（⚠️不要在 CPU 线程池里 submit，避免队列满时阻塞线程池）
        ocr_futs = [None] * len(paths)
        for i, (pp, _) in enumerate(processed):
            ocr_futs[i] = self.ocr_engine.submit(pp)

        # 3) 并行后处理：等待 OCR -> 解析文本规则
        def _post(i: int) -> dict:
            ocr_lines = ocr_futs[i].result(timeout=self.ocr_timeout)
            text_lines = [x.text for x in ocr_lines]
            return self._parse_text_lines(text_lines)

        post_fut_to_idx = {self._executor.submit(_post, i): i for i in range(len(paths))}
        results: list[dict] = [None] * len(paths)

        for fut in as_completed(post_fut_to_idx):
            i = post_fut_to_idx[fut]
            try:
                results[i] = fut.result()
            except Exception as exc:
                results[i] = {
                    "merchant": "未知商户",
                    "amount": 0.0,
                    "category": "未分类",
                    "raw_text": [],
                    "error": str(exc),
                }

        # 4) 统一清理临时文件
        for pp, is_temp in processed:
            if is_temp:
                try:
                    os.remove(pp)
                except OSError:
                    pass

        return results
    
    # --------- 新增：噪声关键词（可持续补充）---------
    _NOISE_CONTAINS = (
        "待发货", "交易成功", "交易失败", "订单信息", "服务保障", "申请开票", "查看更多",
        "商品总价", "运费", "店铺优惠", "平台优惠", "红包", "立减", "优惠", "共减",
        "实付款", "合计", "总计", "订单金额", "支付时间", "付款方式", "支付奖励",
        "收款方", "收款方全称", "账单分类", "推荐服务", "更多", "号码保护", "复制",
        "x1", "X1", "×1", "退款", "退货", "售后", "客服",
    )

    _ADDRESS_HINTS = (
        "省", "市", "区", "县", "镇", "乡", "路", "街", "道", "号",
        "弄", "巷", "里", "小区", "苑", "村", "公寓",
        "栋", "幢", "单元", "室", "楼", "层", "门牌",
    )

    _PAYEE_HINTS = ("有限公司", "有限责任公司", "公司", "商贸", "商务", "科技", "信息", "网络", "中心")

    # --------- 新增：通用清洗 ---------
    @staticmethod
    def _strip(s: str) -> str:
        return (s or "").strip()

    @staticmethod
    def _compact(s: str) -> str:
        return (s or "").replace(" ", "").replace("\u3000", "").strip()

    @staticmethod
    def _parse_money_from_text(text: str) -> list[float]:
        """
        从一行文本里抽取所有数字（含千分位/符号），返回 float 列表
        """
        vals = []
        for m in _MONEY_RE.findall(text or ""):
            try:
                v = float(m.replace(",", ""))
                vals.append(v)
            except Exception:
                pass
        return vals

    @classmethod
    def _clean_item_text(cls, s: str) -> str:
        """
        清洗商品名：去价格、去数量、去箭头、去多余符号
        """
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

    # --------- 新增：KV 标签取值（支持跨行拼接）---------
    def _value_after_label(self, lines: list[str], label: str, join_next: int = 1) -> str | None:
        """
        查找包含 label 的行，取 label 后面的内容；如果本行没有值，拼接后续 1~N 行
        """
        for i, raw in enumerate(lines):
            s = self._strip(raw)
            if not s or label not in s:
                continue

            tail = s.split(label, 1)[1].strip(" ：:|丨")
            val = tail

            # label 行后面没有值：取下一行/下两行
            if not val:
                parts = []
                for j in range(i + 1, min(len(lines), i + 1 + join_next)):
                    nxt = self._strip(lines[j])
                    if not nxt:
                        continue
                    # 遇到下一条“像字段名”的行就停
                    if any(k in nxt for k in ("支付时间", "付款方式", "收款方", "账单分类", "订单金额", "商品总价", "运费", "店铺优惠", "实付款")):
                        break
                    parts.append(nxt)
                val = "".join(parts)

            val = self._clean_item_text(val)
            return val if val else None
        return None

    # --------- 新增：判噪声/判地址/评分 ---------
    def _is_noise_line(self, s: str) -> bool:
        s2 = self._compact(s)
        if not s2:
            return True
        if _PHONE_MASK_RE.search(s2):
            return True
        if _DATE_RE.search(s2) or _TIME_RE.search(s2):
            return True
        if any(k in s2 for k in self._NOISE_CONTAINS):
            # 注意：这里包含 “退款” 之类也当噪声（因为不是商品名）
            return True
        return False

    def _looks_like_address(self, s: str) -> bool:
        s2 = self._compact(s)
        if not s2:
            return False
        # 强地址信号：栋/楼/室/号 + 数字组合
        if any(h in s2 for h in ("栋", "楼", "室", "单元", "门牌")) and re.search(r"\d", s2):
            return True
        # 普通地址信号太泛（“公寓”在你第二张图的商品说明里也会出现），所以只做弱判
        if any(h in s2 for h in ("路", "街", "号")) and re.search(r"\d", s2):
            return True
        return False

    def _score_item_candidate(self, s: str) -> int:
        """
        给“像商品名”的行打分，分高者胜
        """
        s0 = self._strip(s)
        s2 = self._compact(s0)

        if not s2:
            return -999
        if self._is_noise_line(s2):
            return -999
        if self._looks_like_address(s2):
            return -50

        score = 0

        # 越长越像商品/说明（但别太离谱）
        score += min(len(s2), 60)

        # 有字母数字（型号/房号/期数）通常很有用
        if re.search(r"[A-Za-z0-9]", s2):
            score += 30

        # 常见商品/账单描述词（你可持续补充）
        if any(k in s2 for k in ("鼠标", "键盘", "耳机", "充电", "电源", "会员", "账单", "第", "期", "房租", "物业", "水电", "停车")):
            score += 20

        # 公司名更像“收款方”而不是“商品”
        if any(k in s2 for k in self._PAYEE_HINTS):
            score -= 20

        # 纯数字/像金额：扣分
        if re.fullmatch(r"[-+]?\d+(?:\.\d+)?", s2):
            score -= 50

        return score

    # --------- 新增：提取 item / payee / amount ---------
    def _extract_item_name(self, text_lines: list[str]) -> str:
        # 1) 优先：商品说明
        for lab in ("商品说明", "商品名称", "商品描述"):
            v = self._value_after_label(text_lines, lab, join_next=2)
            if v:
                return v

        # 2) 其次：从候选里选最高分（并尝试把下一行短尾巴拼上）
        best = ("", -10**9)
        n = len(text_lines)
        for i, raw in enumerate(text_lines):
            s = self._strip(raw)
            score = self._score_item_candidate(s)
            if score <= -999:
                continue

            # 拼接下一行（常见 “账 / 单” 断行）
            joined = s
            if i + 1 < n:
                nxt = self._strip(text_lines[i + 1])
                if nxt and not self._is_noise_line(nxt) and len(self._compact(nxt)) <= 4:
                    joined = s + nxt

            joined = self._clean_item_text(joined)
            if joined and score > best[1]:
                best = (joined, score)

        return best[0] if best[0] else "未知商品"

    def _extract_payee(self, text_lines: list[str]) -> str:
        # 1) 标签：收款方全称/收款方
        for lab in ("收款方全称", "收款方", "商户"):
            v = self._value_after_label(text_lines, lab, join_next=1)
            if v:
                return v

        # 2) 兜底：找一个像公司名的行（前半段更可能出现）
        for s in text_lines[:12]:
            s2 = self._strip(s)
            if not s2:
                continue
            if any(k in s2 for k in self._PAYEE_HINTS) and len(self._compact(s2)) <= 30:
                return s2

        return "未知收款方"

    def _extract_amount(self, text_lines: list[str]) -> float:
        # 1) 强标签优先
        strong_labels = ("实付款", "实付", "支付金额", "交易金额", "付款金额", "合计", "总计")
        for s in text_lines:
            if any(lab in s for lab in strong_labels):
                vals = self._parse_money_from_text(s.replace("¥", "").replace("￥", ""))
                if vals:
                    return float(abs(vals[-1]))

        # 2) 订单金额 - 立减/优惠（第二张图这种很稳）
        order_amt = None
        discount = 0.0
        for s in text_lines:
            if "订单金额" in s:
                vals = self._parse_money_from_text(s)
                if vals:
                    order_amt = vals[-1]
            if ("立减" in s or "优惠" in s or "红包" in s) and "-" in s:
                vals = self._parse_money_from_text(s)
                if vals:
                    # 一般是 -3.08 这种
                    discount += vals[-1]

        if order_amt is not None:
            # discount 可能是负数（-3.08），所以 order + discount
            amt = order_amt + discount
            if amt > 0:
                return float(round(amt, 2))

        # 3) 兜底：找“像交易金额”的大数（优先带小数/千分位/负号）
        best = 0.0
        best_score = -10**9
        for idx, s in enumerate(text_lines[:15]):  # 交易大金额通常在顶部
            s2 = self._compact(s)
            if not s2:
                continue
            if _DATE_RE.search(s2) or _TIME_RE.search(s2):
                continue
            vals = self._parse_money_from_text(s2)
            for v in vals:
                av = abs(v)
                if av <= 0 or av >= 50000:
                    continue
                # 打分：越靠前越好；带小数/千分位更像金额；负号也加分（支出常见）
                sc = 0
                sc += max(0, 30 - idx * 2)
                if "." in s2:
                    sc += 10
                if "," in s2:
                    sc += 10
                if "-" in s2:
                    sc += 5
                # 避免把 154、16 这种小数字当成主要金额：金额本身也计分
                sc += min(int(av), 2000) // 10

                if sc > best_score:
                    best_score = sc
                    best = av

        return float(round(best, 2)) if best > 0 else 0.0

    # ----------------------- ✅ 替换：文本解析（纯CPU） -----------------------
    def _parse_text_lines(self, text_lines: list[str]) -> dict:
        item_name = self._extract_item_name(text_lines)
        payee = self._extract_payee(text_lines)
        amount = self._extract_amount(text_lines)

        data = {
            # ✅ 你要的：merchant 字段现在放“商品名称/商品说明”
            "merchant": item_name,

            # ✅ 保留收款方（可选字段，不影响你现有表格展示）
            "payee": payee,

            "amount": amount,
            "category": "未分类",
            "raw_text": text_lines,
        }

        # 分类：关键词可命中 item / payee / 全文
        current_priority = 0
        haystacks = [item_name, payee] + text_lines
        for text in haystacks:
            for key, cat in config.CATEGORY_RULES.items():
                if key and key in (text or ""):
                    is_weak = key in config.WEAK_KEYWORDS
                    this_priority = 1 if is_weak else 2
                    if this_priority >= current_priority:
                        data["category"] = cat
                        current_priority = this_priority

        # 兜底：电商/订单页
        if data["category"] == "未分类" and any(k in "".join(text_lines) for k in ("待发货", "订单信息", "申请开票")):
            data["category"] = "购物/电商"

        return data
