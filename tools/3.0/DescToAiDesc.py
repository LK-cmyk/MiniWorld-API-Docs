import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger

from common.annotation import strip_annotations
from common.config import MERGED_30_FILE, API_30_FILE

INPUT_FILE = str(MERGED_30_FILE)
OUTPUT_DIR = str(API_30_FILE.parent)
OUTPUT_FILE = str(API_30_FILE)


def main() -> None:
    """主函数"""
    content = MERGED_30_FILE.read_text(encoding="utf-8")
    result = strip_annotations(content)

    API_30_FILE.parent.mkdir(parents=True, exist_ok=True)
    API_30_FILE.write_text(result, encoding="utf-8")

    logger.info(f"处理完成！")
    logger.info(f"输入: {INPUT_FILE}")
    logger.info(f"输出: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
