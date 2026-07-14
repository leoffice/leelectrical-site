#!/usr/bin/env python3
"""Parse Baez Place requisitions 1–12 from Google Drive spreadsheets → JSON for LE Pro."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import openpyxl

DRIVE_BASE = Path.home() / "My Drive/1 Martin Dorkin/Projects/334 E 176/Requisition"
REQ5_BASE = Path.home() / "My Drive/Requisition 5"
GOOGLE_API = Path.home() / ".hermes/profiles/loaf_pod/skills/productivity/google-workspace/scripts/google_api.py"
OUT = Path(__file__).resolve().parent / "baez_requisitions_import.json"

# Accessible via office@leelectrical.us token; 4 & 5 live on amra account (interpolated).
REQ_SHEETS = {
    1: "1bkMK-L2OW4szuBiaWduFNMbMtLpqzoQfcFCIjISkD0Y",
    2: "12mxNOv9t8UXcj2tFLW5h7affJGokiHl-kl3AjAneYkM",
    3: "1dzaZ2N7xezslrVsy126yaBdrBe2trMDKFAFekAS2x6U",
    6: "10JexQ0WW9PQipD46xZ9nZ_-y1S80gGy0CHF8UhX3H_U",
    7: "192b9O0p1VOGrDq-JW93MtkRqOeg5HOH19zg7W-BR8Gc",
    8: "1r0s7WZFLoABBfl9wmcY1HLeNRtmBB1jhG9sQ6T-H-fk",
    9: "1vfmxpbsgXew0kovGYowMnCwusx768Emh47vN6HVhaNw",
    10: "1btS8-EEmELUr5v90rFr_Z989kBVjM97gFsdAdEYg_yY",
    11: "15ETZY2TwnYlVFYbqKXriokCAYCwh9a2EYYbXxgYUa8o",
    12: "1CJfquOMXkGk83m37PUpyqwFy7OA5_beqiCz9DXDBNpA",
}

INTERPOLATE_REQS = {4, 5}


def pm(raw) -> float:
    if raw is None:
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def norm_key(section: str, desc: str) -> str:
    sec = re.sub(r"\s+", " ", (section or "").strip().lower())
    d = re.sub(r"\s+", " ", (desc or "").strip().lower())
    return f"{sec}|{d}"


def download_xlsx(file_id: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(GOOGLE_API),
            "drive",
            "download",
            file_id,
            "--out",
            str(dest),
            "--export-mime",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def parse_g702(ws) -> dict:
    data: dict = {}
    for row in ws.iter_rows(min_row=1, max_row=60, values_only=True):
        txt = " ".join(str(c) for c in row if c is not None)
        if "LESS PREVIOUS CERTIFICATES" in txt:
            big = [pm(c) for c in row if pm(c) > 1000]
            if big:
                data["previousCertificates"] = max(big)
        if "CURRENT PAYMENT DUE" in txt:
            big = [pm(c) for c in row if pm(c) > 100]
            if big:
                data["currentPaymentDue"] = max(big)
        if "TOTAL COMPLETED" in txt and "STORED" in txt:
            big = [pm(c) for c in row if pm(c) > 10000]
            if big:
                data["totalCompleted"] = max(big)
        for c in row:
            if hasattr(c, "year"):
                data["periodTo"] = c.strftime("%Y-%m-%d")
    return data


def parse_g703(ws) -> list[dict]:
    rows: list[dict] = []
    section = ""
    for row in ws.iter_rows(min_row=13, max_row=300, values_only=True):
        if not any(row):
            continue
        colb, colc = row[1], row[2]
        sched = pm(row[3] if len(row) > 3 else 0)
        pct = row[8] if len(row) > 8 else 0
        desc = colc if colc else colb
        if isinstance(colb, str) and colb and sched == 0 and not colc:
            section = colb
            continue
        if not desc or sched <= 0:
            continue
        if isinstance(pct, (int, float)):
            p = round(pct * 100, 2) if pct <= 1 else round(float(pct), 2)
        else:
            p = 0.0
        rows.append(
            {
                "key": norm_key(section, str(desc)),
                "section": section,
                "description": str(desc).strip(),
                "value": sched,
                "completedPct": p,
            }
        )
    return rows


def drive_search_pdf(name: str) -> dict | None:
    try:
        out = subprocess.check_output(
            [sys.executable, str(GOOGLE_API), "drive", "search", name, "--max", "5"],
            text=True,
        )
        hits = json.loads(out)
        for h in hits:
            if h.get("name", "").lower() == name.lower():
                return {"name": h["name"], "webViewLink": h.get("webViewLink", "")}
        for h in hits:
            if name.lower().replace(" ", "") in h.get("name", "").lower().replace(" ", ""):
                return {"name": h["name"], "webViewLink": h.get("webViewLink", "")}
    except Exception:
        pass
    return None


def folder_attachments(num: int) -> list[dict]:
    folder = DRIVE_BASE / f"Requisition {num}"
    if num == 5 and not folder.exists():
        folder = REQ5_BASE
    out: list[dict] = []
    for candidate in (
        f"Requisition {num}.pdf",
        f"Req {num}.pdf",
        f"Req {num} .pdf",
    ):
        hit = drive_search_pdf(candidate)
        if hit:
            out.append(hit)
            break
    if folder.exists():
        for pdf in sorted(folder.glob("*.pdf")) + sorted(folder.glob("*.PDF")):
            if any(pdf.name == a.get("name") for a in out):
                continue
            out.append({"name": pdf.name, "localPath": str(pdf)})
    return out


def interpolate_items(before: dict, after: dict, ratio: float) -> dict:
    keys = set(before) | set(after)
    merged = {}
    for k in keys:
        b = before.get(k, {}).get("completedPct", 0)
        a = after.get(k, {}).get("completedPct", 0)
        merged[k] = {
            **(after.get(k) or before.get(k) or {}),
            "completedPct": round(b + (a - b) * ratio, 2),
        }
    return merged


def main() -> None:
    parsed: dict[int, dict] = {}
    cache = Path("/tmp/baez_req_cache")
    cache.mkdir(exist_ok=True)

    for num, fid in REQ_SHEETS.items():
        path = cache / f"req{num}.xlsx"
        if not path.exists():
            download_xlsx(fid, path)
        wb = openpyxl.load_workbook(path, data_only=True)
        g702 = parse_g702(wb["Application & Cert"])
        items = parse_g703(wb["Continuation Sheet"])
        by_key = {it["key"]: it for it in items}
        parsed[num] = {
            "num": num,
            "g702": g702,
            "items": items,
            "byKey": by_key,
            "attachments": folder_attachments(num),
        }
        print(f"req {num}: {len(items)} lines, due ${g702.get('currentPaymentDue', 0):,.0f}", file=sys.stderr)

    # Master SOV from req 12 (includes change orders).
    master = parsed[12]["items"]
    master_keys = [it["key"] for it in master]

    reqs_out = []
    prev_by_key: dict[str, dict] = {}

    for num in range(1, 13):
        if num in INTERPOLATE_REQS:
            before = parsed[3]["byKey"]
            after = parsed[6]["byKey"]
            ratio = 0.33 if num == 4 else 0.66
            by_key = interpolate_items(before, after, ratio)
            g702 = {
                "periodTo": "2024-07-15" if num == 4 else "2024-08-01",
                "note": "interpolated — amra Drive sheet not on leelectrical token",
            }
            attachments = folder_attachments(num)
        else:
            src = parsed[num]
            by_key = src["byKey"]
            g702 = src["g702"]
            attachments = src["attachments"]

        snapshot = []
        for i, key in enumerate(master_keys):
            it = by_key.get(key) or prev_by_key.get(key) or master[i]
            pct = it.get("completedPct", 0)
            snapshot.append({"key": key, "completedPct": pct})

        prev_by_key = {s["key"]: {"completedPct": s["completedPct"]} for s in snapshot}

        reqs_out.append(
            {
                "num": num,
                "applicationNumber": f"REQ-{num}",
                "periodTo": g702.get("periodTo", ""),
                "g702": g702,
                "itemsSnapshot": snapshot,
                "attachments": attachments,
            }
        )

    payload = {
        "masterItems": [
            {
                "id": f"item-{i + 1}",
                "section": it["section"],
                "description": it["description"],
                "value": it["value"],
                "contractPct": 0,
                "completedPct": it["completedPct"],
            }
            for i, it in enumerate(master)
        ],
        "contractSum": round(sum(it["value"] for it in master), 2),
        "requisitions": reqs_out,
        "driveFolder": str(DRIVE_BASE),
    }

    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()