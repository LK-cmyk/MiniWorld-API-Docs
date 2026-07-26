#!/usr/bin/env python3
"""MiniWorld API 差异查看主程序

提供统一的 CLI 入口，支持查看 2.0/3.0 的函数、枚举、事件差异
以及执行合并、转 AI 描述等操作

用法
    python tools/main.py compare func --version 2.0
    python tools/main.py compare enum --version 3.0
    python tools/main.py compare event --version 2.0
    python tools/main.py compare all
    python tools/main.py merge --version 2.0
    python tools/main.py desc --version 3.0
    python tools/main.py all
    python tools/main.py list
"""

from __future__ import annotations

import contextlib
import importlib.util
import sys
import types  # 新增: 用于模块类型注解
from pathlib import Path
from typing import Generator, Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from typer.core import TyperGroup

from common.io_utils import init_stdout, logger

_TOOLS_DIR: Path = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

# 配置常量
VERSIONS: list[str] = ["2.0", "3.0"]
COMPARE_TYPES: list[str] = ["func", "enum", "event"]
MODULE_MAP: dict[str, str] = {
    "func": "FuncCompare",
    "enum": "EnumLibCompare",
    "event": "EventCompare",
}
EXAMPLES_TEXT: str = """\
python tools/main.py compare func --version 2.0
python tools/main.py compare enum --version 3.0
python tools/main.py compare event --version all
python tools/main.py compare all
python tools/main.py compare all --output report.txt
python tools/main.py merge --version 2.0
python tools/main.py desc --version 3.0
python tools/main.py all
python tools/main.py list"""

console: Console = Console(highlight=False)  # Rich 控制台


def validate_choice(value: str, allowed: list[str], label: str) -> None:
    """校验选项是否合法，否则抛出 typer.Exit"""
    allowed_set: set[str] = set(allowed) | {"all"}
    if value not in allowed_set:
        typer.echo(f"错误: 无效的{label} '{value}'，可选: {', '.join(allowed + ['all'])}")
        raise typer.Exit(1)


def load_module(version: str, module_name: str) -> Optional[types.ModuleType]:
    """加载 tools/{version}/{module_name}.py 并返回模块对象"""
    filepath: Path = _TOOLS_DIR / version / f"{module_name}.py"
    if not filepath.is_file():
        console.print(f"[red]✗[/] 错误: 文件不存在: {filepath}")
        return None

    spec = importlib.util.spec_from_file_location(f"{version}.{module_name}", str(filepath))
    if spec is None or spec.loader is None:
        console.print(f"[red]✗[/] 错误: 无法加载模块: {filepath}")
        return None

    module = importlib.util.module_from_spec(spec)
    with _temporary_sys_path(str(_TOOLS_DIR)):
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            console.print(f"[red]✗[/] 加载模块失败 {filepath}: {exc}")
            return None
    return module


def _run_module_main(version: str, module_name: str) -> int:
    """加载模块并执行其 main() 函数，返回 0 表示成功，1 表示失败"""
    module = load_module(version, module_name)
    if module is None:
        return 1
    if not hasattr(module, "main"):
        console.print(f"[red]✗[/] 错误: 模块 {version}/{module_name}.py 缺少 main() 函数")
        return 1
    try:
        module.main()
        return 0
    except Exception as exc:
        console.print(f"[red]✗[/] 执行 {version}/{module_name}.py 时出错: {exc}")
        return 1


@contextlib.contextmanager
def _temporary_sys_path(extra_path: str) -> Generator[None, None, None]:
    """临时将 extra_path 加入 sys.path 的上下文管理器"""
    inserted: bool = False
    if extra_path not in sys.path:
        sys.path.insert(0, extra_path)
        inserted = True
    try:
        yield
    finally:
        if inserted:
            sys.path.remove(extra_path)


def run_with_tee(module: types.ModuleType, output_path: Optional[Path] = None) -> int:
    """运行模块的 main()，可选择同时输出到文件

    禁用模块内部的 init_stdout() 以避免 loguru 重复配置
    """
    original_init = getattr(module, "init_stdout", None)
    module.init_stdout = lambda: None  # type: ignore[attr-defined]

    sink_id: int | None = None
    try:
        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            sink_id = logger.add(
                str(output_path),
                format="{message}",
                level="TRACE",
                encoding="utf-8",
            )
        module.main()
        return 0
    except Exception as exc:
        console.print(f"[red]✗ 错误: {exc}[/]")
        return 1
    finally:
        if sink_id is not None:
            logger.remove(sink_id)
        if original_init is not None:
            module.init_stdout = original_init  # type: ignore[attr-defined]


def print_section_header(title: str) -> None:
    """打印 rich 风格的章节标题"""
    console.print()
    console.print(Rule(style="cyan"))
    console.print(Panel(title, style="bold cyan", expand=False))
    console.print(Rule(style="cyan"))


def run_compare(
    compare_type: str,
    version: str,
    output_file: Optional[str] = None,
) -> int:
    """对比指定类型和版本的差异，可输出到文件"""
    versions: list[str] = VERSIONS if version == "all" else [version]
    types: list[str] = COMPARE_TYPES if compare_type == "all" else [compare_type]
    output_path: Optional[Path] = Path(output_file) if output_file else None

    exit_code: int = 0
    # 如果输出到文件，先清空（覆盖写入）而非追加，避免重复内容
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("", encoding="utf-8")

    for ver in versions:
        for ctype in types:
            module_name = MODULE_MAP[ctype]
            module = load_module(ver, module_name)
            if module is None:
                exit_code = 1
                continue

            title: str = f"[{ver}] {ctype.upper()} 对比"
            plain_title: str = f"\n{'=' * 70}\n  {title}\n{'=' * 70}\n"

            if output_path:
                with open(output_path, "a", encoding="utf-8") as fp:
                    fp.write(plain_title)

            print_section_header(title)
            ret: int = run_with_tee(module, output_path)
            if ret != 0:
                exit_code = 1

    if output_path:
        console.print(f"\n[green]✓[/] 结果已保存至: [bold]{output_path.resolve()}[/]")
    return exit_code


def run_merge(version: str) -> int:
    """合并 multiple 目录下的声明文件"""
    print_section_header(f"合并 {version} 声明文件")
    return _run_module_main(version, "Merge")


def run_desc(version: str) -> int:
    """将合并后的声明转为 AI 描述文件"""
    print_section_header(f"{version} 转 AI 描述文件")
    return _run_module_main(version, "DescToAiDesc")


def run_list() -> None:
    """列出所有可用操作"""
    table: Table = Table(
        title="MiniWorld API 差异查看工具",
        title_style="bold cyan",
        border_style="cyan",
    )
    table.add_column("分类", style="bold green", width=10)
    table.add_column("命令", style="bold yellow")
    table.add_column("说明", style="white")

    for ctype in COMPARE_TYPES:
        table.add_row("对比", f"compare {ctype} --version 2.0", f"对比 2.0 {ctype} 差异")
        table.add_row("", f"compare {ctype} --version 3.0", f"对比 3.0 {ctype} 差异")

    table.add_row("对比", "compare all", "对比所有版本所有类别")
    table.add_row("", "", "")

    for ver in VERSIONS:
        table.add_row("合并", f"merge --version {ver}", f"合并 {ver} 声明文件")
    table.add_row("", "", "")

    for ver in VERSIONS:
        table.add_row("转换", f"desc --version {ver}", f"{ver} 转 AI 描述文件")
    table.add_row("", "", "")

    table.add_row("批量", "all", "批量运行所有对比")
    table.add_row("", "all --output report.txt", "输出到文件")

    panel: Panel = Panel(
        table,
        title="[bold cyan]可用命令一览[/]",
        border_style="cyan",
        padding=(1, 2),
    )
    console.print(panel)


def run_all(output_file: Optional[str] = None) -> int:
    """顺序执行所有对比操作"""
    return run_compare("all", "all", output_file)


class ExamplesPanelGroup(TyperGroup):
    """自定义 TyperGroup: 在标准帮助文本之后追加 Rich 面板形式的示例"""

    def format_help(self, ctx, formatter) -> None:
        super().format_help(ctx, formatter)
        console.print(
            Panel(
                EXAMPLES_TEXT,
                title="Example",
                title_align="left",
                border_style="rgb(122,124,128)",
                padding=(0, 1),
                expand=False,
            )
        )


app: typer.Typer = typer.Typer(
    name="miniworld-api-desc",
    help="MiniWorld API 差异查看工具",
    context_settings={"help_option_names": ["-h", "--help"]},
    add_completion=False,
    rich_markup_mode="rich",
    cls=ExamplesPanelGroup,
)


@app.command()
def compare(
    compare_type: str = typer.Argument(
        "all",
        help="对比类型（func/enum/event/all）",
    ),
    version: str = typer.Option(
        "all",
        "--version",
        "-v",
        help="API 版本（2.0/3.0/all）",
    ),
    output: Optional[str] = typer.Option(
        None,
        "--output",
        "-o",
        help="输出到文件（可选）",
    ),
) -> None:
    """对比本地声明与网页文档的差异"""
    validate_choice(compare_type, COMPARE_TYPES, "对比类型")
    validate_choice(version, VERSIONS, "版本")
    raise typer.Exit(run_compare(compare_type, version, output))


@app.command()
def merge(
    version: str = typer.Option(
        ...,
        "--version",
        "-v",
        help="API 版本（2.0/3.0）",
    ),
) -> None:
    """合并 multiple 目录下的声明文件"""
    validate_choice(version, VERSIONS, "版本")
    raise typer.Exit(run_merge(version))


@app.command()
def desc(
    version: str = typer.Option(
        ...,
        "--version",
        "-v",
        help="API 版本（2.0/3.0）",
    ),
) -> None:
    """将合并后的声明转为 AI 描述文件"""
    validate_choice(version, VERSIONS, "版本")
    raise typer.Exit(run_desc(version))


@app.command("all")
def all_cmd(
    output: Optional[str] = typer.Option(
        None,
        "--output",
        "-o",
        help="输出到文件（可选）",
    ),
) -> None:
    """批量运行所有版本的差异对比"""
    raise typer.Exit(run_all(output))


@app.command("list")
def list_cmd() -> None:
    """列出所有可用操作"""
    run_list()


def main() -> None:
    """主入口"""
    init_stdout()
    app()


if __name__ == "__main__":
    main()
