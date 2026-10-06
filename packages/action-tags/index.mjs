import definitions from './action-tags.json' with { type: 'json' };

export const ActionTag = Object.freeze({ ...definitions.tags });
export const RESOURCE_TAGS = Object.freeze([...definitions.resources]);
export const ACTION_TAG_RESOURCES = Object.freeze({
  ...definitions.effects,
  [ActionTag.FULL_SYNC]: RESOURCE_TAGS
});

const ACTION_TAG_VALUES = new Set(Object.values(ActionTag));

export function isActionTag(value) {
  return typeof value === 'string' && ACTION_TAG_VALUES.has(value);
}

export function expandActionTags(tags) {
  if (tags.includes(ActionTag.FULL_SYNC)) return [...RESOURCE_TAGS];
  return [...new Set(tags.flatMap((tag) => ACTION_TAG_RESOURCES[tag] || []))];
}

export default { ActionTag, RESOURCE_TAGS, ACTION_TAG_RESOURCES, isActionTag, expandActionTags };
