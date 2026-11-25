const apiCommands = Object.freeze({
  sync: {},
  'bot.upsert': {},
  'bot.delete': { requiresApply: true },
  'model.upsert': {},
  'model.add-many': {},
  'model.list': {},
  'model.test': {},
  'model.default': {},
  'model.delete': { requiresApply: true },
  'settings.update': {},
  'rule.upsert': {},
  'routine.upsert': {},
  'memory.upsert': {},
  'memory.delete': { requiresApply: true },
  'message.send': {},
  'attention.reply': {},
  'work.cancel': { requiresApply: true },
  'work.reassign': {},
  'connector.t3.configure': {},
  'artifact.preview': {},
  'artifact.open': { requiresApply: true },
});

export function apiPolicy(type) {
  return typeof type === 'string' && Object.hasOwn(apiCommands, type) ? apiCommands[type] : undefined;
}
