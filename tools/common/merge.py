"""合并 multiple 目录下的 .d.lua 文件为单个声明文件"""

import os


def get_ordered_files(folder_path: str, order_definition: list[str]) -> list[str]:
    """获取指定顺序的文件列表

    按 order_definition 的顺序排列 .lua 文件，
    未在定义中的文件按字母顺序追加到末尾。

    Args:
        folder_path: 文件夹路径
        order_definition: 自定义顺序定义（模块名列表，不含 .d.lua 后缀）

    Returns:
        有序文件列表
    """
    all_files: set[str] = {f for f in os.listdir(folder_path) if f.endswith(".lua")}
    ordered_files: list[str] = []
    for name in order_definition:
        filename: str = f"{name}.d.lua"
        if filename in all_files:
            ordered_files.append(filename)
            all_files.discard(filename)

    if all_files:
        ordered_files.extend(sorted(all_files))

    return ordered_files


def merge_lua_files(folder_path: str, output_file: str, order_definition: list[str]) -> None:
    """合并多个 .lua 文件

    Args:
        folder_path: 文件夹路径
        output_file: 输出目标文件路径
        order_definition: 合并顺序定义
    """
    ordered_files: list[str] = get_ordered_files(folder_path, order_definition)

    if not ordered_files:
        return

    merged_parts: list[str] = []
    total_lines: int = 0

    for filename in ordered_files:
        file_path: str = os.path.join(folder_path, filename)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content: str = f.read()

            total_lines += content.count("\n") + (0 if content.endswith("\n") else 1)

            if not merged_parts:
                merged_parts.append(content)
            else:
                if not merged_parts[-1].endswith(("\n", "\r")):
                    merged_parts.append("\n")
                merged_parts.append(content)

        except Exception:
            pass

    result: str = "".join(merged_parts)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(result)
