"""Deterministic checks on a draft answer, and parsing of the model critic's verdict.

Every number, number word, and capitalised name in a draft must appear in the verified template answer.
Text that reads like an instruction is never passed to the writer.
"""

import re
from dataclasses import dataclass

# Digits with optional thousands separators or a decimal part. A prime mark (12') ends the number.
NUMBER_PATTERN = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")
# Letters, with inner apostrophes or hyphens (O'Brien, Brenmoor-based).
WORD_PATTERN = re.compile(r"[^\W\d_]+(?:['’-][^\W\d_]+)*")
POSSESSIVE_PATTERN = re.compile(r"['’]s$")
INSTRUCTION_PATTERN = re.compile(
    r"\b(?:ignore|disregard|forget|override|pretend|instructions?|prompts?)\b",
    re.IGNORECASE,
)
CRITIC_VERDICT_PATTERN = re.compile(r"(ACCEPT|REWRITE)\b", re.IGNORECASE)
# Common English words that are not names, so a capitalised "The" or "He" passes the name check.
COMMON_WORDS = frozenset(
    """a an the this that these those there here i he she it they we you his her its their our your
    in on at by for from with of to and or but so as if when while after before also only still
    yes no not today is was are be has have had do does did""".split()
)
# Spelled-out figures, so "two goals" cannot slip past the digit check.
NUMBER_WORDS = frozenset(
    """zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
    sixteen seventeen eighteen nineteen twenty thirty forty fifty hundred thousand once twice thrice
    first second third fourth fifth sixth seventh eighth ninth tenth dozen""".split()
)
MAX_REASON_CHARS = 200


@dataclass(frozen=True)
class Verdict:
    passed: bool
    reason: str = ""


def reads_as_instruction(text: str) -> bool:
    return INSTRUCTION_PATTERN.search(text) is not None


def unsupported_reason(draft: str, sources: str) -> str | None:
    """Return why the draft is unsupported, or None when every number and name appears in the sources."""
    if not draft.strip():
        return "the draft is empty"
    known_numbers = {number.replace(",", "") for number in NUMBER_PATTERN.findall(sources)}
    for token in NUMBER_PATTERN.findall(draft):
        if token.replace(",", "") not in known_numbers:
            return f"the number {token} is not in the evidence"
    known_words = {word.lower() for word in _words(sources)}
    for word in _words(draft):
        if word.lower() in NUMBER_WORDS and word.lower() not in known_words:
            return f"the number {word} is not in the evidence"
        if word[0].isupper() and word.lower() not in known_words and word.lower() not in COMMON_WORDS:
            return f"the name {word} is not in the evidence"
    return None


def parse_critic_reply(reply: str) -> Verdict:
    """Read the critic's line: ACCEPT, or REWRITE with a reason. Anything else counts as a failed review."""
    text = reply.strip()
    match = CRITIC_VERDICT_PATTERN.match(text)
    if match is None:
        return Verdict(passed=False, reason="the critic did not answer ACCEPT or REWRITE")
    if match.group(1).upper() == "ACCEPT":
        return Verdict(passed=True)
    _, _, reason = text.partition(":")
    one_line = " ".join(reason.split()).strip(" .")[:MAX_REASON_CHARS]
    return Verdict(passed=False, reason=one_line or "the critic asked for a rewrite")


def _words(text: str) -> list[str]:
    return [POSSESSIVE_PATTERN.sub("", word) for word in WORD_PATTERN.findall(text)]
