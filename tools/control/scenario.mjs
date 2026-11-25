import { ControlError } from './isolation.mjs';

function fail(code, message, nextAction) {
  throw new ControlError(code, message, nextAction);
}

function destructiveControl(action, target) {
  if (action === 'chooseMenuItem') return /^(?:.* > )?(?:删除|清空|重置|delete)$/i.test(target);
  if (action !== 'press') return false;
  const locator = target.split(' >> ').filter(part => !/^nth=/.test(part)).at(-1);
  return /^id:(?:[\w-]+-delete(?:-|$)|delete(?:-|$)|cancel-work(?:-|$))/i.test(locator) ||
    /^(?:label|text):(?:删除|清空|重置|停止事项|delete\b)/i.test(locator);
}

export function validateScenario(value) {
  if (!Array.isArray(value.steps) || !value.steps.length) fail('SCENARIO_INVALID', '缺少步骤列表', '参照 model-settings.json 修正场景');
  for (const step of value.steps) {
    const entries = Object.entries(step ?? {});
    const [[action, arg] = []] = entries;
    const locator = text => typeof text === 'string' && /^(id|label|text):.{1,300}$/.test(text);
    const valid = entries.length === 1 && (
      action === 'screenshot' && typeof arg === 'string' && /^[a-z0-9-]{1,60}$/.test(arg) ||
      ['type', 'value', 'select'].includes(action) && Array.isArray(arg) && arg.length === 2 &&
        locator(arg[0]) && (action === 'select' ? locator(arg[1]) : typeof arg[1] === 'string') ||
      action === 'chooseMenuItem' && typeof arg === 'string' && /^.{1,300}$/.test(arg) ||
      action === 'key' && typeof arg === 'string' && /^(?:[a-z0-9]|backspace)$/.test(arg) ||
      ['wait', 'gone', 'press', 'clear', 'submit', 'rightClick'].includes(action) && locator(arg)
    );
    if (!valid) fail('SCENARIO_INVALID', '存在不支持的界面步骤', '查看 tools/control/README.md 中支持的步骤和格式');
    const dangerous = action === 'select' ? arg.some(target => destructiveControl('press', target)) : destructiveControl(action, arg);
    if (dangerous && value.destructive !== true) {
      fail('SCENARIO_INVALID', '删除类操作需要场景声明 destructive', '为场景加 destructive: true，再用 --dry-run 查看步骤');
    }
  }
}
