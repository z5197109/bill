import paddle
print("paddle", paddle.__version__)
print("cuda?", paddle.is_compiled_with_cuda())
try:
    print("cudnn", paddle.version.cudnn())
except Exception as e:
    print("cudnn check failed:", e)
print("device", paddle.device.get_device())