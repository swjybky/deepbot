import type { RemoteAnswers, RemoteQuestion } from "../protocol.ts";
import { isArray, isRecord } from "../wire-values.ts";

export function t3Questions(raw: unknown): RemoteQuestion[] {
  if (!isArray(raw) || !raw.length) return [];
  const result: RemoteQuestion[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.question !== "string" || !item.question.trim() || !isArray(item.options)) return [];
    ids.add(item.id);
    result.push({
      id: item.id, question: item.question, multiSelect: item.multiSelect === true, required: item.required !== false,
      allowCustomAnswer: item.allowCustomAnswer !== false,
      ...(typeof item.initialAnswer === "string" ? { initialAnswer: item.initialAnswer } : {}),
      options: item.options.flatMap(option => isRecord(option) && typeof option.label === "string" && option.label.trim()
        ? [{ label: option.label, value: typeof option.value === "string" ? option.value : option.label, ...(typeof option.description === "string" ? { description: option.description } : {}) }]
        : []),
    });
  }
  return result;
}

export function validateT3Answers(questions: RemoteQuestion[], input: unknown): RemoteAnswers {
  if (!isRecord(input) || Object.keys(input).some(id => !questions.some(question => question.id === id)))
    throw new Error("请在 T3 Code 提问卡上作答");
  return Object.fromEntries(questions.map(question => {
    const chosen = Object.hasOwn(input, question.id) ? input[question.id] : [];
    if (!isArray(chosen) || (question.required !== false && chosen.length === 0) || (!question.multiSelect && chosen.length > 1) ||
      !chosen.every((value): value is string => typeof value === "string" && !!value.trim() &&
        (question.allowCustomAnswer === true || question.options.some(option => option.value === value))))
      throw new Error("请填写 T3 Code 提问的必答项并选择有效选项");
    return [question.id, [...new Set(chosen)]];
  }));
}
