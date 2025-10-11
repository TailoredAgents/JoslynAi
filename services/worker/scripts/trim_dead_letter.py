import argparse
import json
import os
import sys
from typing import Optional

import redis


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trim worker dead-letter queue to the most recent N items."
    )
    parser.add_argument(
        "--queue",
        default=os.getenv("JOB_DEAD_LETTER_QUEUE", "jobs:dead"),
        help="Redis list key for dead-letter entries (default: jobs:dead or JOB_DEAD_LETTER_QUEUE env).",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=int(os.getenv("DEAD_LETTER_KEEP", "100")),
        help="Number of most recent entries to retain (default: 100 or DEAD_LETTER_KEEP env).",
    )
    parser.add_argument(
        "--redis-url",
        default=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        help="Redis connection URL (default: REDIS_URL env or redis://localhost:6379/0).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show how many entries would be trimmed without deleting.",
    )
    return parser.parse_args()


def connect(redis_url: str) -> redis.Redis:
    try:
        return redis.from_url(redis_url, decode_responses=True)
    except Exception as err:
        raise SystemExit(f"Failed to connect to Redis ({redis_url}): {err}") from err


def trim_dead_letter(client: redis.Redis, queue: str, keep: int, dry_run: bool) -> dict:
    length = client.llen(queue)
    to_trim = max(length - keep, 0)
    outcome = {"queue": queue, "length": length, "kept": min(length, keep), "trimmed": 0}
    if to_trim <= 0:
        return outcome
    if dry_run:
        outcome["trimmed"] = to_trim
        return outcome

    # Use LTRIM to keep only the most recent `keep` entries (tail of the list).
    client.ltrim(queue, -keep, -1)
    outcome["trimmed"] = to_trim
    return outcome


def main() -> None:
    args = parse_args()
    if args.keep < 0:
        raise SystemExit("--keep must be non-negative")

    client = connect(args.redis_url)
    result = trim_dead_letter(client, args.queue, args.keep, args.dry_run)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
