import { computed, signal, View } from "nsh";
import { Button, ChoiceCard } from "../../components";
import { accentColor } from "../../state/bots";
import { respond, openExternal, requestPending, type Attention, type RemoteAnswers, type RemoteQuestion } from "../../state/runtime";
import { isT3Request } from "../../state/t3-thread";
import { T3ThreadButtons } from "../../components/T3ThreadButtons";
export function AttentionCard(props: { attention: Attention }) {
  const lastRequest = signal("");
  const pending = () => !!props.attention.replyPending || requestPending(lastRequest());
  const send = (text: string, answers?: RemoteAnswers) => { if (text.trim() && !pending()) lastRequest.set(respond(props.attention.id, text, answers) ?? ""); };
  const detail = () => props.attention.action ? [props.attention.remoteRequest?.kind === "approval" ? null : props.attention.action.description, props.attention.action.destination, props.attention.action.path, props.attention.action.content].filter(Boolean).join("\n") : "";
  const label = () => props.attention.kind === "approval" ? "需要你批准" : props.attention.kind === "external" ? "对方在等你" : props.attention.kind === "rule" ? "确认规矩" : "需要你决定";
  const questions = () => props.attention.remoteRequest?.kind === "question" ? props.attention.remoteRequest.questions : undefined;
  const showRemoteQuestions = computed(() => props.attention.state === "open" && !!questions());
  const t3 = computed(() => isT3Request(props.attention));
  const showActions = computed(() => props.attention.state === "open" && (t3() || !!props.attention.externalUrl));
  const link = () => showActions() ? <If when={t3()} else={
    <Button label="打开对方页面" size="sm" onPress={() => { void openExternal(props.attention.externalUrl!); }} />
  }><T3ThreadButtons attention={props.attention} /></If> : null;
  const testID = () => `attention-${props.attention.id}`;
  return <If when={showRemoteQuestions()} else={
    <ChoiceCard question={props.attention.question} detail={detail()} options={props.attention.options}
      allowOther={!props.attention.remoteRequest} answer={props.attention.state === "resolved" ? props.attention.value ?? "已处理" : undefined}
      pending={pending()} onChoose={send} accent={accentColor()} label={label()} testID={testID()}>{link()}</ChoiceCard>
  }>
    <RemoteQuestionForm questions={questions() ?? []} pending={pending()} onSubmit={answers => send("答复", answers)} testID={testID()} />
  </If>;
}

function RemoteQuestionForm(props: { questions: readonly RemoteQuestion[]; pending: boolean; onSubmit: (answers: RemoteAnswers) => void; testID: string }) {
  const draft = signal<RemoteAnswers>({});
  const options = (question: RemoteQuestion) => question.options.map((option, index, all) => ({ ...option,
    label: all.some((other, otherIndex) => otherIndex !== index && other.label === option.label) ? `${option.label}（${index + 1}）` : option.label,
  }));
  const optionValue = (question: RemoteQuestion, label: string) => options(question).find(option => option.label === label)?.value ?? label.trim();
  const detail = (question: RemoteQuestion) => options(question).filter(option => option.description && option.description !== option.label).map(option => `${option.label} · ${option.description}`).join("\n");
  const current = (question: RemoteQuestion) => Object.hasOwn(draft(), question.id) ? draft()[question.id]! : question.initialAnswer ? [question.initialAnswer] : [];
  const valid = () => props.questions.every(question => question.required === false || current(question).length > 0);
  const submit = () => { if (valid() && !props.pending) props.onSubmit(Object.fromEntries(props.questions.map(question => [question.id, current(question)]))); };
  const choose = (question: RemoteQuestion, label: string) => {
    const value = optionValue(question, label);
    const previous = current(question);
    draft.set({ ...draft(), [question.id]: question.multiSelect ? previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value] : [value] });
  };
  const simple = computed(() => {
    const [question] = props.questions;
    return props.questions.length === 1 && !!question && !question.multiSelect && question.required !== false && !question.initialAnswer;
  });
  return <If when={simple()} else={
      <View class="w-full max-w-[560px] gap-2 self-start rounded-card border border-border bg-card p-2" testID={props.testID}>
        <Each of={props.questions} key={item => item.id}>{item => <ChoiceCard inline question={item().question} detail={detail(item())}
          options={[...options(item()).map(option => option.label), ...current(item()).filter(value => !item().options.some(option => option.value === value))]}
          selectedOptions={current(item()).map(value => options(item()).find(option => option.value === value)?.label ?? value)} multiple={item().multiSelect}
          allowOther={item().allowCustomAnswer} pending={props.pending} onChoose={value => choose(item(), value)}
          accent={accentColor()} label="T3 Code 提问" testID={`${props.testID}-${item().id}`} />}</Each>
        <View class="flex-row justify-end px-2 pb-1.5"><Button label={props.pending ? "提交中" : "提交答复"} size="sm" variant="primary" disabled={!valid() || props.pending} onPress={submit} testID={`${props.testID}-send`} /></View>
      </View>
  }>
    <Each of={props.questions} key={item => item.id}>{item => <ChoiceCard
      question={item().question} detail={detail(item())} options={options(item()).map(option => option.label)}
      allowOther={item().allowCustomAnswer} pending={props.pending} onChoose={value => props.onSubmit({ [item().id]: [optionValue(item(), value)] })}
      accent={accentColor()} label="T3 Code 提问" testID={props.testID} />}</Each>
  </If>;
}
