def extract_iep(task: dict):
    print(f"[EXTRACT] IEP for document_id={task.get('document_id')}")
    # TODO: call LLM with structured outputs (core/schemas/iep.schema.json)
    return {"status": "ok"}

def extract_eob(task: dict):
    print(f"[EXTRACT] EOB for document_id={task.get('document_id')}")
    # TODO: call LLM with structured outputs (core/schemas/eob.schema.json)
    return {"status": "ok"}

