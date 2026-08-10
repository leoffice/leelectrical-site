#!/usr/bin/env python3
"""
Scan Google Drive folder:
  My Drive / BLZ Electric Inc / Permits / Completed

Writes:
  ~/.hermes/shared/blz_completed_permits.json
  netlify/functions/data/blz_completed_permits.json  (if repo path known)

Merge optional OCR fields from ~/.hermes/shared/completed_permits_extract.json
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

COMPLETED = Path(
    "/Users/levik/Library/CloudStorage/GoogleDrive-office@leelectrical.us/"
    "My Drive/BLZ Electric Inc/Permits/Completed"
)
EXTRACT = Path("/Users/levik/.hermes/shared/completed_permits_extract.json")
OUT_HERMES = Path("/Users/levik/.hermes/shared/blz_completed_permits.json")
OUT_REPO = Path(
    "/Users/levik/Downloads/leelectrical-repo/netlify/functions/data/blz_completed_permits.json"
)


def norm_name(n: str) -> str:
    return re.sub(r"\s+", " ", str(n or "").strip()).lower()


def address_from_filename(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(
        r"\s*(wwp|swo|s1|temp power|temp|supersede|for ecb|hoist)\s*$",
        "",
        stem,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", stem).strip(" -_")


def permit_kind_from_name(name: str) -> str:
    n = name.lower()
    if "wwp" in n:
        return "wwp"
    if "swo" in n:
        return "swo"
    if "temp" in n:
        return "temp"
    if "hoist" in n:
        return "hoist"
    if "supersede" in n:
        return "supersede"
    if re.search(r"\bs1\b", n):
        return "s1"
    return "electrical"


def has_real_permit_no(permit_no: str) -> bool:
    s = str(permit_no or "").strip().upper().replace(" ", "")
    if not s or len(s) < 6:
        return False
    if re.search(r"LLC|INC|CORP|AVENUE|STREET|PLACE|ROAD", s, re.I):
        return False
    return bool(re.match(r"^[A-Z]\d{5,}(-[A-Z0-9]+)*(-EL)?$", s))


def main() -> int:
    if not COMPLETED.is_dir():
        print(f"missing folder: {COMPLETED}", file=sys.stderr)
        return 1

    extract = []
    if EXTRACT.exists():
        extract = json.loads(EXTRACT.read_text())
    by_name = {norm_name(e.get("fileName")): e for e in extract if isinstance(e, dict)}

    rows = []
    for p in sorted(COMPLETED.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file() or p.suffix.lower() != ".pdf":
            continue
        st = p.stat()
        ex = by_name.get(norm_name(p.name), {})
        permit_no = str(ex.get("permitNo") or "").strip()
        issued = str(ex.get("issuedDate") or "").strip()[:10]
        expires = str(ex.get("expiresDate") or "").strip()[:10]
        addr_file = address_from_filename(p.name)
        addr = str(ex.get("addressFromPdf") or ex.get("addressFromFile") or addr_file).strip()
        address = re.sub(r"\s+\d{5}(-\d{4})?\s*$", "", addr).strip() or addr_file
        rid = hashlib.sha1(f"completed|{p.name}|{st.st_size}".encode()).hexdigest()[:12]
        rows.append(
            {
                "id": f"blz-completed-{rid}",
                "source": "blz_completed",
                "folder": "BLZ Electric Inc/Permits/Completed",
                "fileName": p.name,
                "address": address,
                "addressFromFile": addr_file,
                "permitNo": permit_no,
                "issuedDate": issued,
                "expiresDate": expires,
                "issuedTo": str(ex.get("issuedTo") or "").strip(),
                "description": str(ex.get("description") or "").strip(),
                "contractorBusiness": str(
                    ex.get("contractorBusiness") or "BLZ ELECTRIC INC."
                ).strip(),
                "kind": permit_kind_from_name(p.name),
                "extractOk": bool(ex.get("extract_ok") and permit_no),
                "hasRealPermitNo": has_real_permit_no(permit_no),
                "fileSize": st.st_size,
                "fileMtime": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                "drivePath": f"My Drive/BLZ Electric Inc/Permits/Completed/{p.name}",
            }
        )

    doc = {
        "schema": "blz-completed-permits/v1",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "folder": "BLZ Electric Inc/Permits/Completed",
        "localPath": str(COMPLETED),
        "count": len(rows),
        "withPermitNo": sum(1 for r in rows if r["hasRealPermitNo"]),
        "permits": rows,
    }

    OUT_HERMES.parent.mkdir(parents=True, exist_ok=True)
    OUT_HERMES.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {OUT_HERMES} count={doc['count']} withPermitNo={doc['withPermitNo']}")

    try:
        OUT_REPO.parent.mkdir(parents=True, exist_ok=True)
        OUT_REPO.write_text(json.dumps(doc, indent=2) + "\n")
        print(f"wrote {OUT_REPO}")
    except OSError as e:
        print(f"repo write skipped: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
