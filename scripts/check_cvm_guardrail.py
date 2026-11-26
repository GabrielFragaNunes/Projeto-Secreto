#!/usr/bin/env python3
"""Scan user-facing application sources for prohibited investment language."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = (
    Path("apps/web/app"),
    Path("apps/web/components"),
    Path("services/engine-py/app"),
)
OPTIONAL_SCAN_ROOTS = {Path("apps/web/components")}
IGNORED_DIRECTORY_NAMES = {"node_modules", ".next", "__pycache__", "tests", "__tests__"}
FORBIDDEN_PATTERN = re.compile(
    r"\b(?:recomendamos|sugerimos\s+comprar|compre\s+agora|venda\s+agora|"
    r"carteira\s+recomendada|oportunidade\s+imperdível)\b",
    re.IGNORECASE,
)


def is_test_file(filename: str) -> bool:
    normalized_name = filename.casefold()
    return (
        normalized_name.startswith("test_")
        or normalized_name.endswith("_test.py")
        or ".test." in normalized_name
        or ".spec." in normalized_name
    )


def find_violations(text: str) -> list[tuple[int, str]]:
    """Return each prohibited match with its one-based line number."""
    return [
        (line_number, match.group(0))
        for line_number, line in enumerate(text.splitlines(), start=1)
        for match in FORBIDDEN_PATTERN.finditer(line)
    ]


def main() -> int:
    violations: list[tuple[Path, int, str]] = []

    for relative_root in SCAN_ROOTS:
        scan_root = ROOT / relative_root
        if not scan_root.is_dir():
            if relative_root in OPTIONAL_SCAN_ROOTS:
                continue
            print(f"Diretório de verificação não encontrado: {relative_root}", file=sys.stderr)
            return 2

        for current_directory, directories, filenames in os.walk(scan_root):
            directories[:] = sorted(
                name
                for name in directories
                if name.casefold() not in IGNORED_DIRECTORY_NAMES
            )
            for filename in sorted(filenames):
                if is_test_file(filename):
                    continue
                source_path = Path(current_directory) / filename
                try:
                    source = source_path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                except OSError as error:
                    print(f"Não foi possível ler {source_path}: {error}", file=sys.stderr)
                    return 2

                for line_number, term in find_violations(source):
                    violations.append((source_path, line_number, term))

    if violations:
        for source_path, line_number, term in violations:
            relative_path = source_path.relative_to(ROOT)
            print(f"{relative_path}:{line_number}: termo prescritivo detectado: {term}")
        return 1

    print("Guardrail CVM aprovado: nenhum termo prescritivo encontrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
