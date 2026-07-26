"""I/O 工具函数：初始化等"""

import sys
import io
from loguru import logger


def init_stdout() -> None:
    """初始化输出编码为 UTF-8，配置 loguru"""
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    # 移除默认 stderr 处理器，添加 stdout 处理器
    logger.remove()
    logger.add(sys.stdout, format="{message}", level="TRACE", colorize=False)
