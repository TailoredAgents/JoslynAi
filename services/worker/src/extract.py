def extract_iep(task: dict):
    print(f"[EXTRACT] IEP for document_id={task.get('document_id')}")
    return {"status": "ok"}

def extract_eob(task: dict):
    print(f"[EXTRACT] EOB for document_id={task.get('document_id')}")
    return {"status": "ok"}

