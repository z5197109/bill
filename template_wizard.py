# template_wizard.py
# 交互式账单模板向导：OCR -> 显示每行 -> 引导生成模板 -> 保存到 templates 文件
# ✅ 参数在 main() 里配置，不走命令行

import os
import re
import json
import time
import shutil
import tempfile
from typing import Any, Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None


# ------------------ 尝试兼容导入（适配包/非包两种运行方式） ------------------

def _import_bill_parser_symbols():
    """
    尽量兼容两种结构：
    - 包内：from .bill_parser import ...
    - 同目录：from bill_parser import ...
    """
    try:
        from app.bill_parser import BillParser, _load_templates_from_file, DEFAULT_TEMPLATES  # type: ignore
        return BillParser, _load_templates_from_file, DEFAULT_TEMPLATES
    except Exception:
        from app.bill_parser import BillParser, _load_templates_from_file, DEFAULT_TEMPLATES  # type: ignore
        return BillParser, _load_templates_from_file, DEFAULT_TEMPLATES


BillParser, _load_templates_from_file, DEFAULT_TEMPLATES = _import_bill_parser_symbols()


# ------------------ 工具函数 ------------------

def _now_stamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def _read_templates(path: str) -> List[Dict[str, Any]]:
    if not path or (not os.path.exists(path)):
        return []
    return _load_templates_from_file(path)


def _backup_file(path: str) -> Optional[str]:
    if not path or (not os.path.exists(path)):
        return None
    bak = f"{path}.bak_{_now_stamp()}"
    shutil.copy2(path, bak)
    return bak


def _write_templates(path: str, templates: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    ext = os.path.splitext(path)[1].lower()

    if ext == ".json":
        with open(path, "w", encoding="utf-8") as f:
            json.dump(templates, f, ensure_ascii=False, indent=2)
        return

    if ext in (".yml", ".yaml"):
        try:
            import yaml  # type: ignore
        except Exception as e:
            raise RuntimeError("写入 YAML 需要安装 pyyaml：pip install pyyaml") from e
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(templates, f, allow_unicode=True, sort_keys=False)
        return

    raise ValueError("templates 文件只支持 .json/.yml/.yaml")


def _prompt(s: str, default: Optional[str] = None) -> str:
    if default is None:
        v = input(s).strip()
        return v
    v = input(f"{s}（默认：{default}）: ").strip()
    return v if v else default


def _prompt_int(s: str, default: int) -> int:
    v = _prompt(s, str(default))
    try:
        return int(v)
    except Exception:
        return default


def _prompt_float(s: str, default: float) -> float:
    v = _prompt(s, str(default))
    try:
        return float(v)
    except Exception:
        return default


def _prompt_bool(s: str, default: bool = False) -> bool:
    d = "y" if default else "n"
    v = _prompt(f"{s} (y/n)", d).lower()
    return v in ("y", "yes", "1", "true", "t")


def _prompt_list(s: str, default: Optional[List[str]] = None) -> List[str]:
    d = ",".join(default or [])
    v = _prompt(s, d if default is not None else None)
    if not v:
        return []
    parts = [x.strip() for x in v.split(",")]
    return [x for x in parts if x]


def _print_lines(lines: List[str], title: str = "OCR 行") -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)
    for i, t in enumerate(lines):
        print(f"[{i:02d}] {t}")
    print("=" * 80 + "\n")


def _pick_line_index(lines: List[str], s: str, allow_blank: bool = True) -> Optional[int]:
    while True:
        v = input(s).strip()
        if allow_blank and v == "":
            return None
        try:
            idx = int(v)
            if 0 <= idx < len(lines):
                return idx
            print(f"行号超界：0~{len(lines)-1}")
        except Exception:
            print("请输入整数行号（或直接回车跳过）")


def _pick_substrings_from_line(line: str) -> List[str]:
    print(f"该行内容：{line}")
    print("请输入你要用作关键词的子串，多个用逗号分隔（建议选稳定且短的片段）")
    v = input("关键词子串: ").strip()
    if not v:
        return [line[:8]] if line else []
    return [x.strip() for x in v.split(",") if x.strip()]


def _apply_scope(lines: List[str], scope: Dict[str, Any]) -> Tuple[List[str], List[int]]:
    """
    复刻 BillParser._apply_scope 的行为（让向导里能即时看到 scope 结果）
    返回：(scoped_lines, scoped_to_raw_map)
    """
    start_at_any = list((scope or {}).get("start_at_any", []) or [])
    start_after_any = list((scope or {}).get("start_after_any", []) or [])
    end_before_any = list((scope or {}).get("end_before_any", []) or [])
    drop_first = int((scope or {}).get("drop_first", 0) or 0)
    drop_last = int((scope or {}).get("drop_last", 0) or 0)

    n = len(lines)
    idx_map = list(range(n))
    start = 0
    end = n

    if start_at_any:
        for i, s in enumerate(lines):
            if any(k in s for k in start_at_any):
                start = i
                break

    if start_after_any:
        for i, s in enumerate(lines):
            if i < start:
                continue
            if any(k in s for k in start_after_any):
                start = i + 1
                break

    if end_before_any:
        for i in range(start, n):
            if any(k in lines[i] for k in end_before_any):
                end = i
                break

    start = min(max(start + drop_first, 0), n)
    end = max(min(end - drop_last, n), start)

    scoped = lines[start:end]
    scoped_map = idx_map[start:end]
    return scoped, scoped_map


# ------------------ 交互式构建模板 ------------------

def build_match(lines: List[str]) -> Dict[str, Any]:
    print("\n[1/5] 配置 match（用于识别账单类型）")
    print("建议：any 放 2~5 个“该页面稳定出现”的关键词；太泛的词不要放（如 返回/完成）")
    any_ = _prompt_list("match.any（逗号分隔）", [])
    all_ = _prompt_list("match.all（可空；全部必须出现）", [])
    # not_ = _prompt_list("match.not（可空；出现则排除）", [])
    # regex_any = _prompt_list("match.regex_any（可空；正则列表）", [])
    # min_score = _prompt_int("match.min_score", 1)
    not_ = []
    regex_any = []
    min_score = 100

    m: Dict[str, Any] = {"min_score": min_score}
    if any_:
        m["any"] = any_
    if all_:
        m["all"] = all_
    if not_:
        m["not"] = not_
    if regex_any:
        m["regex_any"] = regex_any
    return m


def build_scope(lines: List[str]) -> Dict[str, Any]:
    print("\n[2/5] 配置 scope（裁剪有效区域，让行号更稳定）")
    use_scope = _prompt_bool("是否启用 scope？", True)
    if not use_scope:
        return {}

    scope: Dict[str, Any] = {}

    print("\n--- 选择 start_at_any / start_after_any（可都不填） ---")
    _print_lines(lines, "当前 OCR 行（用于选 scope 锚点）")
    mode = _prompt("起始裁剪模式：1=start_at_any  2=start_after_any  0=不用起始锚点", "1").strip()

    if mode == "1":
        idx = _pick_line_index(lines, "请选择起始锚点行号（start_at_any）（回车跳过）: ")
        if idx is not None:
            scope["start_at_any"] = _pick_substrings_from_line(lines[idx])
    elif mode == "2":
        idx = _pick_line_index(lines, "请选择起始锚点行号（start_after_any）（回车跳过）: ")
        if idx is not None:
            scope["start_after_any"] = _pick_substrings_from_line(lines[idx])

    print("\n--- 选择 end_before_any（可不填） ---")
    idx2 = _pick_line_index(lines, "请选择结束锚点行号（end_before_any）（回车跳过）: ")
    if idx2 is not None:
        scope["end_before_any"] = _pick_substrings_from_line(lines[idx2])

    scope["drop_first"] = _prompt_int("scope.drop_first（裁掉 scope 后头几行）", 0)
    scope["drop_last"] = _prompt_int("scope.drop_last（裁掉 scope 后尾几行）", 0)

    scoped, _ = _apply_scope(lines, scope)
    _print_lines(scoped, "scope 结果（scoped_lines）")
    return scope


def _build_rule_common(scoped_lines: List[str], field_name: str, is_amount: bool) -> Dict[str, Any]:
    print(f"\n[3/5] 配置 extract.{field_name}")
    print("你可以用两种方式：")
    print("  A) 纯按行号（line）——配合 scope 很快可用")
    print("  B) 用 anchor（anchor_any/anchor_regex）定位基准行，再相对取 line ——更稳")
    _print_lines(scoped_lines, f"当前 scoped_lines（用于配置 {field_name}）")

    mode = _prompt("选择模式：A=按行号  B=按锚点", "A").upper()

    rule: Dict[str, Any] = {}

    rule["search_window"] = _prompt_int("search_window（容错范围）", 2 if not is_amount else 1)
    rule["join_next"] = _prompt_int("join_next（拼接后续行数）", 0 if is_amount else 0)
    rule["clean"] = (False if is_amount else _prompt_bool("clean（是否清洗商品名）", True))
    rule["skip_datetime_phone"] = _prompt_bool("skip_datetime_phone（跳过时间/掩码电话）", not is_amount)

    default_skip = []
    if field_name == "item":
        default_skip = ["订单信息", "服务保障", "申请开票", "付款方式", "运费", "店铺优惠", "平台优惠", "共减", "实付款"]
    if field_name == "payee":
        default_skip = ["付款方式", "订单信息", "服务保障", "申请开票"]

    skip_contains = _prompt_list("skip_contains（包含这些词则跳过；逗号分隔，可空）", default_skip)
    if skip_contains:
        rule["skip_contains"] = skip_contains

    if is_amount:
        rule["require_regex"] = _prompt("require_regex（金额行必须匹配的正则）", r"(¥|￥)\s*\d")
    else:
        if _prompt_bool("是否设置 require_regex（可提高准确率）？", False):
            rr = _prompt("require_regex（正则）", "")
            if rr:
                rule["require_regex"] = rr

    if mode == "A":
        idx = _pick_line_index(scoped_lines, f"请选择 {field_name} 所在行号（scoped_lines 行号）: ", allow_blank=False)
        rule["line"] = idx
        return rule

    aidx = _pick_line_index(scoped_lines, f"请选择 anchor 行号（{field_name} 相关标签所在行）: ", allow_blank=False)
    anchor_line = scoped_lines[aidx]
    print("anchor 可选两种：anchor_any（子串）或 anchor_regex（正则）")
    if _prompt_bool("使用 anchor_regex？（否则用 anchor_any）", False):
        ar = _prompt("anchor_regex（正则）", "")
        if ar:
            rule["anchor_regex"] = ar
    else:
        rule["anchor_any"] = _pick_substrings_from_line(anchor_line)

    rule["offset"] = _prompt_int("offset（base=anchor行+offset）", 0)
    rel = _prompt("line（相对 base 的行号；可填单个整数或逗号列表）", "0").strip()
    if "," in rel:
        rule["line"] = [int(x.strip()) for x in rel.split(",") if x.strip()]
    else:
        rule["line"] = int(rel)

    return rule


def build_extract(scoped_lines: List[str]) -> Dict[str, Any]:
    extract: Dict[str, Any] = {}

    extract["item"] = _build_rule_common(scoped_lines, "item", is_amount=False)

    arule = _build_rule_common(scoped_lines, "amount", is_amount=True)
    arule["money_pick"] = _prompt("money_pick（first/last/max_abs/max/min/sum）", "max_abs")
    arule["abs"] = _prompt_bool("abs（输出绝对值）", True)
    arule["round"] = _prompt_int("round（保留小数位）", 2)
    extract["amount"] = arule

    if _prompt_bool("是否配置 payee（收款方）？", False):
        extract["payee"] = _build_rule_common(scoped_lines, "payee", is_amount=False)

    return extract


def preview_and_save(
    image_path: str,
    templates_path: str,
    new_tpl: Dict[str, Any],
    use_gpu: bool,
    cpu_threads: int,
    max_side: int,
    jpeg_quality: int,
    ocr_timeout: Optional[float],
) -> None:
    print("\n[5/5] 预览并保存")

    preview_templates = [new_tpl]

    # 尝试追加默认兜底模板（只是为了预览更稳，不影响最终保存）
    for t in DEFAULT_TEMPLATES[::-1]:
        if t.get("name") == "fallback_by_position":
            preview_templates.append(t)
            break

    p = BillParser(
        max_side=max_side,
        jpeg_quality=jpeg_quality,
        use_gpu=use_gpu,
        cpu_threads=cpu_threads,
        ocr_timeout=ocr_timeout,
        templates=preview_templates,
        debug=True,
    )
    try:
        result = p.parse(image_path)
    finally:
        p.shutdown()

    print("\n--- 预览结果 ---")
    print(f"_template : {result.get('_template')}")
    print(f"merchant  : {result.get('merchant')}")
    print(f"payee     : {result.get('payee')}")
    print(f"amount    : {result.get('amount')}")
    if "_debug" in result:
        print("（debug 已生成，可在返回 JSON 里查看 _debug）")

    if not _prompt_bool("预览看起来正确吗？要保存到 templates 吗？", True):
        print("已取消保存。")
        return

    old_list = _read_templates(templates_path)

    bak = _backup_file(templates_path)
    if bak:
        print(f"已备份：{bak}")

    name = new_tpl.get("name")
    replaced = False
    out_list: List[Dict[str, Any]] = []
    for t in old_list:
        if (t.get("name") == name) and name:
            out_list.append(new_tpl)
            replaced = True
        else:
            out_list.append(t)
    if not replaced:
        out_list.append(new_tpl)

    _write_templates(templates_path, out_list)
    print(f"✅ 已写入模板：{templates_path}")
    print(f"模板数量：{len(out_list)}（{'替换' if replaced else '新增'}：{name}）")


def run_wizard(
    image_path: str,
    templates_path: str,
    use_gpu: bool = True,
    cpu_threads: int = 6,
    max_side: int = 1280,
    jpeg_quality: int = 80,
    ocr_timeout: Optional[float] = None,
) -> None:
    if not os.path.exists(image_path):
        raise FileNotFoundError(image_path)

    parser = BillParser(
        max_side=max_side,
        jpeg_quality=jpeg_quality,
        use_gpu=use_gpu,
        cpu_threads=cpu_threads,
        ocr_timeout=ocr_timeout,
        templates=DEFAULT_TEMPLATES,
        debug=True,
    )

    processed_path, is_temp = parser._preprocess_image(image_path)  # 复用你的逻辑
    try:
        ocr_lines = parser.ocr_engine.run(processed_path, timeout=ocr_timeout)
        lines = [str(getattr(x, "text", "") or "").strip() for x in ocr_lines]
        lines = [l for l in lines if l]
    finally:
        parser.shutdown()
        if is_temp:
            try:
                os.remove(processed_path)
            except OSError:
                pass

    _print_lines(lines, "OCR 结果（原始 text_lines）")
    print("开始创建新模板。你可以随时 Ctrl+C 退出。")

    name_default = f"new_template_{_now_stamp()}"
    name = _prompt("模板 name", name_default)
    # priority = _prompt_int("priority（越大越优先）", 100)
    # category = _prompt("category（可空）", "")
    priority = 90
    category = ""
    match = build_match(lines)
    scope = build_scope(lines)

    scoped_lines, _ = _apply_scope(lines, scope)
    if not scoped_lines:
        print("⚠️ scope 裁剪后为空，建议回去把 scope 调宽。这里继续使用原始 lines 作为 scoped_lines。")
        scoped_lines = lines

    extract = build_extract(scoped_lines)

    new_tpl: Dict[str, Any] = {
        "name": name,
        "priority": priority,
        "match": match,
        "scope": scope,
        "extract": extract,
    }
    if category.strip():
        new_tpl["category"] = category.strip()

    print("\n--- 生成的模板 JSON（将保存到文件）---")
    print(json.dumps(new_tpl, ensure_ascii=False, indent=2))

    preview_and_save(
        image_path=image_path,
        templates_path=templates_path,
        new_tpl=new_tpl,
        use_gpu=use_gpu,
        cpu_threads=cpu_threads,
        max_side=max_side,
        jpeg_quality=jpeg_quality,
        ocr_timeout=ocr_timeout,
    )


def main():
    # ===================== 配置区：你只改这里 =====================

    IMAGE_PATH = r"C:\Users\48948\Desktop\codes\bill\data\bills\2cc5b3e6f26c96900629ec3dceb3965.jpg"
    TEMPLATES_PATH = r"C:\Users\48948\Desktop\codes\bill\templates.json"

    USE_GPU = True
    CPU_THREADS = 6
    MAX_SIDE = 1280
    JPEG_QUALITY = 80
    OCR_TIMEOUT = None  # 如 10.0

    # =============================================================

    run_wizard(
        image_path=IMAGE_PATH,
        templates_path=TEMPLATES_PATH,
        use_gpu=USE_GPU,
        cpu_threads=CPU_THREADS,
        max_side=MAX_SIDE,
        jpeg_quality=JPEG_QUALITY,
        ocr_timeout=OCR_TIMEOUT,
    )


if __name__ == "__main__":
    main()
