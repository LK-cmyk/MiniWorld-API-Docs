#!/usr/bin/env python3
"""MiniWorld-API-Desc 打包脚本的 Python 版本。

功能与原始 PowerShell 脚本保持一致：
1. 清理旧的编译输出
2. 安装/更新 npm 依赖
3. 使用 esbuild 编译 TypeScript（单文件打包）
4. 运行 ESLint 检查
5. 打包 VS Code 扩展 (.vsix)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence

import typer
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

console = Console()
app = typer.Typer(
    name="pack",
    help="MiniWorld-API-Desc 打包脚本",
    add_completion=False,
    no_args_is_help=True,
)


class PackError(RuntimeError):
    """打包流程中的异常。"""


def _print_header() -> None:
    console.print()
    console.print(Panel.fit("打包", style="cyan", border_style="cyan"))


def _print_step(text: str) -> None:
    console.print(f"\n[bold cyan]▶[/bold cyan] {text}")


def _print_success(text: str) -> None:
    console.print(f"[green]✔[/green] {text}")


def _print_warning(text: str) -> None:
    console.print(f"[yellow]⚠[/yellow] {text}")


def _print_error(text: str) -> None:
    console.print(f"[red]✘[/red] {text}")


def _resolve_command(command: Sequence[str]) -> list[str]:
    if not command:
        return []

    first = command[0]
    if first.startswith((".", "/", "\\")) or Path(first).exists():
        return [str(first), *command[1:]]

    resolved = shutil.which(first)
    if resolved:
        return [resolved, *command[1:]]

    if os.name == "nt":
        for ext in (".cmd", ".bat", ".exe", ".ps1"):
            resolved = shutil.which(first + ext)
            if resolved:
                return [resolved, *command[1:]]

    return [str(first), *command[1:]]


def _run_command(command: Sequence[str], cwd: Path, description: str) -> None:
    _print_step(description)
    resolved_command = _resolve_command(command)
    try:
        completed = subprocess.run(resolved_command, cwd=str(cwd), check=False)
    except FileNotFoundError as exc:
        raise PackError(f"未找到可执行文件 '{command[0]}'。请先安装 Node.js / npm，并确保它已加入 PATH。") from exc

    if completed.returncode != 0:
        raise PackError(f"命令失败: {' '.join(resolved_command)}")


def _clean_output(out_dir: Path) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
        _print_success(f"已清理: {out_dir}")
    else:
        _print_warning("输出目录不存在，跳过清理")


def _ensure_vsce() -> None:
    vsce_path = shutil.which("vsce") or shutil.which("vsce.cmd")
    if vsce_path:
        return

    _print_warning("未安装 vsce，正在全局安装...")
    _run_command(["npm", "install", "-g", "@vscode/vsce"], Path.cwd(), "安装 vsce")


@app.command()
def main(
    skip_install: bool = typer.Option(False, "--skip-install", help="跳过 npm install"),
    skip_lint: bool = typer.Option(False, "--skip-lint", help="跳过 ESLint"),
    skip_clean: bool = typer.Option(False, "--skip-clean", help="跳过清理步骤"),
    compile_only: bool = typer.Option(False, "--compile-only", help="仅编译，不打包"),
    clean: bool = typer.Option(False, "--clean", help="仅清除输出目录"),
) -> int:
    """打包 MiniWorld-API-Desc 扩展。"""

    _print_header()

    project_root = Path(__file__).resolve().parent.parent
    addon_dir = project_root / "addon"
    out_dir = addon_dir / "out"

    if clean:
        _print_step("清除编译输出...")
        _clean_output(out_dir)
        console.print()
        console.print(Panel.fit("清理完成", style="green"))
        return 0

    if not skip_install:
        _run_command(["npm", "install"], project_root, "安装/更新 npm 依赖")
        _print_success("npm 依赖安装完成")
    else:
        _print_warning("跳过 npm install")

    if not skip_clean:
        _print_step("清理旧的编译输出...")
        _clean_output(out_dir)
    else:
        _print_warning("跳过清理步骤")

    _run_command(["npm", "run", "compile"], project_root, "使用 esbuild 编译 TypeScript")
    _print_success(f"esbuild 编译完成 → {out_dir / 'extension.js'}（单文件打包，含 sourcemap）")

    if not skip_lint:
        _run_command(["npm", "run", "lint"], project_root, "运行 ESLint")
        _print_success("ESLint 检查通过")
    else:
        _print_warning("跳过 ESLint")

    if compile_only:
        _print_step("编译模式：跳过打包")
        _print_success(f"编译完成！输出目录: {out_dir}")
        console.print()
        console.print(Panel.fit("编译完成", style="green"))
        return 0

    _print_step("打包 VS Code 扩展...")
    _ensure_vsce()

    addon_readme = addon_dir / "README.md"
    root_readme = project_root / "README.md"
    root_readme_backup = project_root / "README.md.bak"

    had_backup = False
    if root_readme.exists():
        shutil.copy2(root_readme, root_readme_backup)
        had_backup = True
        _print_step("已备份根目录 README.md → README.md.bak")

    if addon_readme.exists():
        shutil.copy2(addon_readme, root_readme)
        _print_step("已使用 addon/README.md 替换根目录 README.md")

    output_vsix = project_root / "miniworld-api-desc-addon.vsix"
    try:
        _run_command(["vsce", "package", "--out", str(output_vsix)], project_root, "打包 VS Code 扩展")
        _print_success(f"打包完成！输出: {output_vsix}")
    finally:
        if had_backup and root_readme.exists() and root_readme_backup.exists():
            shutil.move(str(root_readme_backup), str(root_readme))
            _print_step("已恢复根目录 README.md")

    summary = Table(title="打包结果", style="cyan")
    summary.add_column("项目", style="bold")
    summary.add_column("状态")
    summary.add_row("编译输出", str(out_dir))
    summary.add_row("VSIX 包", str(output_vsix))
    console.print()
    console.print(summary)
    console.print()
    console.print(Panel.fit("所有步骤完成", style="green"))
    return 0


if __name__ == "__main__":
    try:
        app()
    except PackError as exc:
        _print_error(str(exc))
        raise SystemExit(1) from exc
