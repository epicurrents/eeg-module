#!/usr/bin/env python3
"""
Generate the HED-SCORE term index the finding picker reads, from a merged HED-SCORE schema release.

The input is the merged XML of the SCORE library and its partnered HED standard, as published in
hed-standard/hed-schemas under ``library_schemas/score/hedxml/``. The output holds the SCORE terms only, with their
names, parents, HED ids, descriptions and value placeholders, the unit strings their placeholders accept, and the
release's version and SHA-256, so a consumer can tell which release a code was picked from. The 1 MB XML is not
shipped.

The index is a derivation of the schema, not a selection from it: every SCORE node is in it, deprecated ones
included and marked, and what a picker hides is the picker's decision. Two rules here must agree with any validator
that accepts the codes the picker writes, because a unit or a term the two disagree on is offered and then refused:

* A unit marked ``SIUnit`` takes the SI modifiers, the symbol ones (``k``, ``m``, ``u``) when the unit is itself a
  symbol and the word ones (``kilo``, ``milli``) when it is a word. Plural unit names are not listed.
* A term takes a value when it has a ``#`` child; the value classes and unit classes are that child's.

Standard library only, so the script runs wherever Python does.

Usage
-----
    python generate_index.py --schema path/to/HED_score_2.1.0.xml --out ../../src/components/vocabulary/hed-score.json

@license Apache-2.0
"""

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

#: Bump when the output layout changes, so a consumer can refuse an index it does not understand.
INDEX_FORMAT = 1

ATTRIBUTION = (
    "Derived from the HED-SCORE library schema, copyright (c) 2021 HED Contributors, licensed under CC-BY-4.0 "
    "(https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/hed-standard/hed-schemas. "
    "Hermes et al., Scientific Data (2025), https://doi.org/10.1038/s41597-025-05791-2. Modified: reduced to the "
    "SCORE terms, their placeholders and units, and rewritten as JSON."
)


def _attributes(node):
    return {
        attribute.findtext("name"): [value.text or "" for value in attribute.findall("value")]
        for attribute in node.findall("attribute")
    }


def _section(root, tag):
    section = root.find(tag)
    return list(section) if section is not None else []


def _text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def _units(root, wanted):
    """The unit strings per unit class in *wanted*, SI prefixes applied, and each class's default unit."""
    modifiers = {"symbol": [], "word": []}
    for modifier in _section(root, "unitModifierDefinitions"):
        kinds = _attributes(modifier)
        if "SIUnitSymbolModifier" in kinds:
            modifiers["symbol"].append(modifier.findtext("name"))
        if "SIUnitModifier" in kinds:
            modifiers["word"].append(modifier.findtext("name"))

    units = {}
    for unit_class in _section(root, "unitClassDefinitions"):
        name = unit_class.findtext("name")
        if name not in wanted:
            continue
        allowed = []
        for unit in unit_class.findall("unit"):
            unit_name = unit.findtext("name")
            allowed.append(unit_name)
            kinds = _attributes(unit)
            if "SIUnit" in kinds:
                prefixes = modifiers["symbol"] if "unitSymbol" in kinds else modifiers["word"]
                allowed.extend(prefix + unit_name for prefix in prefixes)
        default = _attributes(unit_class).get("defaultUnits", [None])[0]
        units[name] = {"default": default, "units": sorted(set(allowed))}
    return units


def build_index(data):
    """The index of the merged schema in *data*, as a JSON-serialisable dict."""
    root = ET.fromstring(data)
    if root.get("library") != "score":
        raise SystemExit(f"not a SCORE library schema: library={root.get('library')!r}")

    terms = []
    branches = []

    def walk(node, parent):
        attributes = _attributes(node)
        children = node.findall("node")
        placeholder = next((child for child in children if child.findtext("name") == "#"), None)
        term = {
            "name": node.findtext("name"),
            "parent": parent,
            "hedId": attributes.get("hedId", [""])[0],
            "description": _text(node.findtext("description")),
        }
        if placeholder is not None:
            value_attributes = _attributes(placeholder)
            term["valueClasses"] = sorted(value_attributes.get("valueClass", []))
            unit_classes = sorted(value_attributes.get("unitClass", []))
            if unit_classes:
                term["unitClasses"] = unit_classes
        if "requireChild" in attributes:
            term["requireChild"] = True
        if "deprecatedFrom" in attributes:
            term["deprecated"] = True
        terms.append(term)
        for child in children:
            if child.findtext("name") != "#":
                walk(child, term["name"])

    for top in root.find("schema").findall("node"):
        if "inLibrary" not in _attributes(top):
            continue
        branches.append(top.findtext("name"))
        walk(top, None)

    unit_classes = {unit_class for term in terms for unit_class in term.get("unitClasses", [])}
    return {
        "format": INDEX_FORMAT,
        "schema": {
            "library": root.get("library"),
            "version": root.get("version"),
            "withStandard": root.get("withStandard"),
            "sha256": hashlib.sha256(data).hexdigest(),
        },
        "license": "CC-BY-4.0",
        "attribution": ATTRIBUTION,
        "branches": branches,
        "units": _units(root, unit_classes),
        "terms": terms,
    }


def dump(index):
    """Pretty-print *index* with one term per line, so a regeneration diffs by term."""
    head = {key: value for key, value in index.items() if key != "terms"}
    text = json.dumps(head, indent=2, ensure_ascii=False)
    rows = ",\n".join("    " + json.dumps(term, ensure_ascii=False, separators=(",", ":")) for term in index["terms"])
    return text[:-2] + ',\n  "terms": [\n' + rows + "\n  ]\n}\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--schema", required=True, type=Path, help="merged HED-SCORE schema XML")
    parser.add_argument("--out", required=True, type=Path, help="index JSON to write")
    args = parser.parse_args()
    index = build_index(args.schema.read_bytes())
    args.out.write_text(dump(index), encoding="utf-8")
    print(f"{len(index['terms'])} terms from HED-SCORE {index['schema']['version']} -> {args.out}")


if __name__ == "__main__":
    main()
