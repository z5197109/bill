# bill_parser.py
import os
import re
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
except ImportError:
    Image = None

from .ocr_engine import SimpleOCR
import config


class BillParser:
    """账单解析器：图片压缩 + 并行吞吐优化（线程池常驻，避免重复初始化 OCR）"""

    _thread_local = threading.local()

    def __init__(
        self,
        max_side: int = 1280,
        jpeg_quality: int = 80,
        use_gpu: bool = False,
        cpu_threads: int = 6,
        pool_workers: int = 4,
        create_executor: bool = True,   # ⭐ 新增：线程本地实例不创建 executor
    ):
        self.max_side = max_side
        self.jpeg_quality = jpeg_quality
        self.use_gpu = use_gpu
        self.cpu_threads = cpu_threads
        self.pool_workers = pool_workers

        # OCR 引擎（很重）
        self.ocr_engine = SimpleOCR(use_gpu=use_gpu, cpu_threads=cpu_threads)

        # ⭐ 常驻线程池：只在“主实例”上创建一次
        self._executor = None
        if create_executor:
            self._executor = ThreadPoolExecutor(
                max_workers=self.pool_workers,
                thread_name_prefix="bill_ocr"
            )

    def shutdown(self):
        """可选：程序退出时调用，释放线程池"""
        if self._executor is not None:
            self._executor.shutdown(wait=False)

    @classmethod
    def _get_thread_parser(cls, max_side: int, jpeg_quality: int, use_gpu: bool, cpu_threads: int):
        """每个线程一个 parser（含 OCR），线程活着就一直复用"""
        parser = getattr(cls._thread_local, "parser", None)
        if (
            parser is None
            or parser.max_side != max_side
            or parser.jpeg_quality != jpeg_quality
            or parser.use_gpu != use_gpu
            or parser.cpu_threads != cpu_threads
        ):
            parser = BillParser(
                max_side=max_side,
                jpeg_quality=jpeg_quality,
                use_gpu=use_gpu,
                cpu_threads=cpu_threads,
                pool_workers=1,            # 无意义，仅占位
                create_executor=False      # ⭐ 关键：线程本地实例不要再建线程池
            )
            cls._thread_local.parser = parser
        return parser

    def _preprocess_image(self, image_path: str) -> str:
        if Image is None:
            return image_path
        try:
            with Image.open(image_path) as img:
                w, h = img.size
                m = max(w, h)
                if m <= self.max_side:
                    return image_path

                scale = self.max_side / m
                new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
                resized = img.resize(new_size, Image.BILINEAR)

                fd, temp_path = tempfile.mkstemp(suffix=".jpg", prefix="bill_opt_")
                os.close(fd)
                resized.convert("RGB").save(
                    temp_path, format="JPEG",
                    quality=self.jpeg_quality,
                    optimize=False
                )
                return temp_path
        except Exception:
            return image_path

    def parse(self, image_path: str):
        processed_path = self._preprocess_image(image_path)
        temp_file = (processed_path != image_path)

        try:
            ocr_results = self.ocr_engine.run(processed_path)
            text_lines = [res.text for res in ocr_results]

            data = {"merchant": "未知商户", "amount": 0.0, "category": "未分类", "raw_text": text_lines}

            # A. 金额
            found_amount = False
            for text in text_lines:
                clean_text = text.replace(" ", "").replace("￥", "").replace("¥", "")
                if "实付款" in text or "合计" in text:
                    nums = re.findall(r"\d+\.?\d*", clean_text)
                    if nums:
                        try:
                            data["amount"] = float(nums[-1])
                            found_amount = True
                            break
                        except Exception:
                            pass

            if not found_amount:
                max_val = 0.0
                for text in text_lines:
                    clean_text = text.replace("¥", "").replace("￥", "")
                    if len(clean_text) < 10:
                        nums = re.findall(r"\d+\.\d+", clean_text)
                        if nums:
                            try:
                                val = float(nums[0])
                                if 0 < val < 50000 and val > max_val:
                                    max_val = val
                            except Exception:
                                pass
                if max_val > 0:
                    data["amount"] = max_val

            # B. 商户/分类
            current_priority = 0
            for text in text_lines:
                for key, cat in config.CATEGORY_RULES.items():
                    if key in text:
                        is_weak = key in config.WEAK_KEYWORDS
                        this_priority = 1 if is_weak else 2
                        if this_priority >= current_priority:
                            data["merchant"] = text
                            data["category"] = cat
                            current_priority = this_priority

            if data["merchant"] == "未知商户" and ("待发货" in str(text_lines) or "退款" in str(text_lines)):
                data["category"] = "购物/电商"

            return data

        finally:
            if temp_file:
                try:
                    os.remove(processed_path)
                except OSError:
                    pass

    @staticmethod
    def _parse_single(path: str, max_side: int, jpeg_quality: int, use_gpu: bool, cpu_threads: int):
        parser = BillParser._get_thread_parser(max_side, jpeg_quality, use_gpu, cpu_threads)
        return parser.parse(path)

    def parse_batch(self, image_paths):
        """⭐ 不再每次创建 ThreadPoolExecutor，复用常驻线程池"""
        paths = list(image_paths)
        if not paths:
            return []

        if self._executor is None:
            # 兜底：万一 create_executor=False 被误用
            self._executor = ThreadPoolExecutor(max_workers=self.pool_workers, thread_name_prefix="bill_ocr")

        results = [None] * len(paths)

        future_to_idx = {
            self._executor.submit(
                self._parse_single,
                path,
                self.max_side,
                self.jpeg_quality,
                self.use_gpu,
                self.cpu_threads,
            ): idx
            for idx, path in enumerate(paths)
        }

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as exc:
                results[idx] = {
                    "merchant": "未知商户",
                    "amount": 0.0,
                    "category": "未分类",
                    "raw_text": [],
                    "error": str(exc),
                }

        return results
