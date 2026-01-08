# ocr_engine.py
from __future__ import annotations

import os
import threading
import queue
import atexit
from dataclasses import dataclass
from typing import List, Optional, Tuple
from concurrent.futures import Future


@dataclass
class OCRLine:
    text: str
    conf: Optional[float] = None
    box: Optional[list] = None


class PaddleOCRQueueEngine:
    """
    全局单实例 PaddleOCR（2.x）+ 线程安全队列
    - PaddleOCR 只在 worker 线程初始化一次
    - run(image_path) 会提交任务并阻塞等待结果（内部 Future）
    """

    def __init__(
        self,
        use_gpu: bool = True,
        lang: str = "ch",
        use_angle_cls: bool = False,
        cpu_threads: int = 6,
        queue_maxsize: int = 256,
        warmup: bool = False,
    ):
        self.use_gpu = use_gpu
        self.lang = lang
        self.use_angle_cls = use_angle_cls
        self.cpu_threads = cpu_threads
        self.queue_maxsize = queue_maxsize
        self.warmup = warmup

        self._q: "queue.Queue[Tuple[str, Future]]" = queue.Queue(maxsize=queue_maxsize)
        self._stop_evt = threading.Event()
        self._worker = threading.Thread(target=self._worker_loop, name="paddleocr_worker", daemon=True)
        self._started = False

        # worker 线程里创建的 OCR 实例
        self._ocr = None

    # ---------------- Windows DLL 路径补齐（可选但推荐） ----------------
    @staticmethod
    def _add_dll_dirs_for_windows():
        """
        Windows 上避免 WinError 127（DLL 依赖找不到）。
        放到 worker 线程里做，确保 import paddle/paddleocr 前生效。
        """
        if os.name != "nt":
            return
        try:
            import site
            from pathlib import Path

            sp = Path(site.getsitepackages()[0])
            dll_dirs = [
                sp / "nvidia" / "cuda_runtime" / "bin",
                sp / "nvidia" / "cudnn" / "bin",
                sp / "nvidia" / "cublas" / "bin",
                sp / "nvidia" / "cufft" / "bin",
                sp / "nvidia" / "curand" / "bin",
                sp / "nvidia" / "cusolver" / "bin",
                sp / "nvidia" / "cusparse" / "bin",
                sp / "nvidia" / "nvjitlink" / "bin",
            ]
            for d in dll_dirs:
                if d.exists():
                    try:
                        os.add_dll_directory(str(d))
                    except Exception:
                        pass
        except Exception:
            pass

    # ---------------- 生命周期 ----------------
    def start(self):
        if self._started:
            return
        self._started = True
        self._worker.start()

    def shutdown(self, wait: bool = True):
        if not self._started:
            return
        self._stop_evt.set()
        # 用一个任务把 worker 从阻塞的 get() 里唤醒
        try:
            f = Future()
            self._q.put_nowait(("", f))
        except Exception:
            pass
        if wait:
            self._worker.join(timeout=10)

    # ---------------- 对外接口 ----------------
    def submit(self, image_path: str) -> Future:
        """
        异步提交：返回 Future（调用方可 future.result()）
        """
        self.start()
        fut: Future = Future()
        self._q.put((image_path, fut))
        return fut

    def run(self, image_path: str, timeout: Optional[float] = None) -> List[OCRLine]:
        """
        同步调用：内部 submit + 等待 Future
        """
        fut = self.submit(image_path)
        return fut.result(timeout=timeout)

    # ---------------- worker 主循环 ----------------
    def _init_ocr_in_worker(self):
        # 1) DLL search path（Win）
        self._add_dll_dirs_for_windows()

        # 2) import + init
        from paddleocr import PaddleOCR

        # PaddleOCR 2.x：使用 ocr(img, cls=...)
        self._ocr = PaddleOCR(
            use_gpu=self.use_gpu,
            lang=self.lang,
            use_angle_cls=self.use_angle_cls,
            show_log=False,
            cpu_threads=self.cpu_threads,
        )

        # 3) warmup（可选）
        if self.warmup:
            try:
                import numpy as np
                dummy = (np.zeros((64, 256, 3), dtype=np.uint8))
                _ = self._ocr.ocr(dummy, cls=self.use_angle_cls)
            except Exception:
                pass

    def _worker_loop(self):
        try:
            self._init_ocr_in_worker()
        except Exception as e:
            # 初始化失败：把队列里所有任务都标记失败
            while True:
                try:
                    _, fut = self._q.get_nowait()
                    if not fut.done():
                        fut.set_exception(e)
                except queue.Empty:
                    break
            return

        import cv2

        while not self._stop_evt.is_set():
            try:
                image_path, fut = self._q.get(timeout=0.2)
            except queue.Empty:
                continue

            if not image_path:
                # 可能是 shutdown 唤醒任务
                if not fut.done():
                    fut.cancel()
                continue

            try:
                img = cv2.imread(image_path)
                if img is None:
                    fut.set_result([])
                    continue

                res = self._ocr.ocr(img, cls=self.use_angle_cls)

                # 兼容 PaddleOCR 2.x 常见返回结构
                if isinstance(res, list) and len(res) == 1 and isinstance(res[0], list):
                    lines = res[0]
                else:
                    lines = res

                out: List[OCRLine] = []
                if isinstance(lines, list):
                    for item in lines:
                        try:
                            box = item[0]
                            txt = item[1][0]
                            conf = float(item[1][1])
                            if txt:
                                out.append(OCRLine(text=txt, conf=conf, box=box))
                        except Exception:
                            continue

                fut.set_result(out)

            except Exception as ex:
                fut.set_exception(ex)


# ---------------- 全局单例 ----------------
_GLOBAL_LOCK = threading.Lock()
_GLOBAL_ENGINE: Optional[PaddleOCRQueueEngine] = None


def get_global_paddle_ocr_engine(
    use_gpu: bool = True,
    lang: str = "ch",
    use_angle_cls: bool = False,
    cpu_threads: int = 6,
    warmup: bool = False,
) -> PaddleOCRQueueEngine:
    """
    获取全局单例引擎（同进程只初始化一次 PaddleOCR）。
    注意：如果你用不同参数多次调用，这里默认“第一次创建的配置”为准。
    """
    global _GLOBAL_ENGINE
    with _GLOBAL_LOCK:
        if _GLOBAL_ENGINE is None:
            _GLOBAL_ENGINE = PaddleOCRQueueEngine(
                use_gpu=use_gpu,
                lang=lang,
                use_angle_cls=use_angle_cls,
                cpu_threads=cpu_threads,
                warmup=warmup,
            )
            _GLOBAL_ENGINE.start()
            atexit.register(lambda: _GLOBAL_ENGINE.shutdown(wait=False))
        return _GLOBAL_ENGINE
