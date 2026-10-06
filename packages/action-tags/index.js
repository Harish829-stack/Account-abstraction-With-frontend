'use strict';

const definitions = require('./action-tags.json');
const ActionTag = Object.freeze({ ...definitions.tags });
const RESOURCE_TAGS = Object.freeze([...definitions.resources]);
const ACTION_TAG_RESOURCES = Object.freeze({
  ...definitions.effects,
  [ActionTag.FULL_SYNC]: RESOURCE_TAGS
});

const ACTION_TAG_VALUES = new Set(Object.values(ActionTag));

function isActionTag(value) {
  return typeof value === 'string' && ACTION_TAG_VALUES.has(value);
}

function expandActionTags(tags) {
  if (tags.includes(ActionTag.FULL_SYNC)) return [...RESOURCE_TAGS];
  return [...new Set(tags.flatMap((tag) => ACTION_TAG_RESOURCES[tag] || []))];
}

module.exports = { ActionTag, RESOURCE_TAGS, ACTION_TAG_RESOURCES, isActionTag, expandActionTags };
