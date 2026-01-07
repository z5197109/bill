# ocr_engine.py
import cv2
import numpy as np
import inspect
from dataclasses import dataclass
from typing import List
from paddleocr import PaddleOCR
import config


@dataclass
class OCRResult:
    text: str
    confidence: float
    box: List[List[float]]


def _filter_kwargs(cls, kwargs: dict) -> dict:
    """
    兼容不同 PaddleOCR 版本：只保留 PaddleOCR.__init__ 支持的参数，避免报错
    """
    try:
        sig = inspect.signature(cls.__init__)
        return {k: v for k, v in kwargs.items() if k in sig.parameters}
    except Exception:
        return kwargs


class SimpleOCR:
    def __init__(self, use_gpu: bool = False, cpu_threads: int = 8):
        print("⏳ 初始化 OCR 引擎...")

        init_kwargs = dict(
            lang="ch",
            show_log=False,  # 少日志更快

            # GPU/CPU
            use_gpu=use_gpu,

            # —— 方向/纠偏相关：全部关闭（提速明显）
            use_angle_cls=False,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,

            # —— CPU 加速：MKLDNN + 线程数（对 CPU 常见提升）
            enable_mkldnn=(not use_gpu),
            cpu_threads=cpu_threads,

            # —— 速度/吞吐：降低检测输入尺寸 + 增大识别 batch
            det_limit_type="max",
            det_limit_side_len=960,   # 可在 736/960/1280 之间试
            rec_batch_num=6,          # 可在 4/6/8 之间试
        )

        self.use_gpu = use_gpu
        self.cpu_threads = cpu_threads
        self.ocr = PaddleOCR(**_filter_kwargs(PaddleOCR, init_kwargs))

        # warmup：减少第一张图特别慢
        dummy = np.zeros((64, 256, 3), dtype=np.uint8)
        try:
            self.ocr.ocr(dummy, cls=False)
        except TypeError:
            self.ocr.ocr(dummy)

        print("✅ OCR 引擎就绪")

    def run(self, image_path: str) -> List[OCRResult]:
        # cv2 读取，支持中文路径
        img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            print(f"❌ 无法读取图片: {image_path}")
            return []

        # 双保险：明确 cls=False（即使 init 里关了，也避免某些版本默认打开）
        try:
            result = self.ocr.ocr(img, cls=False)
        except TypeError:
            result = self.ocr.ocr(img)

        if not result or result[0] is None:
            return []

        first_item = result[0]
        parsed_results: List[OCRResult] = []

        # 兼容字典格式 (PaddleOCR v2.7+ / v3+ 常见)
        if isinstance(first_item, dict):
            texts = first_item.get("rec_texts", first_item.get("rec_text", []))
            scores = first_item.get("rec_scores", first_item.get("rec_score", []))
            boxes = first_item.get("dt_polys", first_item.get("rec_polys", []))

            count = len(texts)
            if len(scores) < count:
                scores = list(scores) + [1.0] * (count - len(scores))
            if len(boxes) < count:
                boxes = list(boxes) + [[]] * (count - len(boxes))

            for i in range(count):
                s = float(scores[i]) if scores[i] is not None else 1.0
                if s > config.OCR_CONFIDENCE_THRESHOLD:
                    parsed_results.append(OCRResult(text=texts[i], confidence=s, box=boxes[i]))
            return parsed_results

        # 兼容旧版列表格式
        if isinstance(first_item, list):
            for line in result[0]:
                if isinstance(line, (list, tuple)) and len(line) >= 2:
                    box = line[0]
                    if isinstance(line[1], (list, tuple)):
                        text, score = line[1][0], line[1][1]
                    else:
                        text, score = line[1], 1.0

                    score = float(score) if score is not None else 1.0
                    if score > config.OCR_CONFIDENCE_THRESHOLD:
                        parsed_results.append(OCRResult(text=text, confidence=score, box=box))

        return parsed_results
