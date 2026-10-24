#!/usr/bin/env python3
"""Dependency-free schema/static checks. Run by CI and locally."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "data/offline_demo.json").read_text("utf-8"))
assert data["buildings"], "empty demo"
ids = [b["id"] for b in data["buildings"]]
assert len(set(ids)) == len(ids), "duplicate building ids"
for b in data["buildings"]:
    assert b["height"] >= 3, b
    assert len(b["outline"]) >= 3, b
    assert all(len(p) == 2 and all(isinstance(v, (float, int)) for v in p) for p in b["outline"])
assert len(data["buildings"]) <= 280
for r in data["roads"]:
    assert len(r["path"]) > 1
    assert r["width"] > 0
source = (ROOT / "scripts/main.gd").read_text("utf-8")
for keyword in ("_load_donga", "_load_custom_region", "_pick_and_fire", "_undo", "_reset"):
    assert keyword in source, keyword
for path in ["project.godot", "scenes/main.tscn", "scripts/destructible_building.gd", "scripts/region_loader.gd", "scripts/world_builder.gd"]:
    assert (ROOT / path).is_file(), path
print("SCBK data and source layout validated.")
