"""结果数据模型

定义所有操作返回的结构化数据，避免各模块直接 print/log。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Summary:
    """统计摘要"""

    title: str
    local_count: int
    web_count: int
    common_count: int
    only_local_count: int
    only_web_count: int


@dataclass
class CompareResult:
    """对比操作的结果"""

    summary: Summary
    details: list[str] = field(default_factory=list)


@dataclass
class MergeResult:
    """合并操作的结果"""

    success: bool
    files_merged: int = 0
    total_lines: int = 0
    output_file: str = ""
    error: Optional[str] = None


@dataclass
class DescResult:
    """转 AI 描述操作的结果"""

    success: bool
    input_file: str = ""
    output_file: str = ""
    error: Optional[str] = None


@dataclass
class UploadResult:
    """上传 JSON 数据到 Worker 的结果"""

    success: bool
    kind: str = ""
    data: str = ""
    url: str = ""
    status_code: int = 0
    message: str = ""
    error: Optional[str] = None
