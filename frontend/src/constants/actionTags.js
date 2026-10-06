import actionTagsPackage from '@aa/action-tags/index.mjs';

export const { ActionTag, RESOURCE_TAGS, ACTION_TAG_RESOURCES } = actionTagsPackage;

const KNOWN_TAGS = new Set(Object.values(ActionTag));

export function labelToActionTag(label = '') {
  const normalized = String(label).toLowerCase();
  if (normalized.includes('deploy')) return ActionTag.DEPLOYMENT;
  if (normalized.includes('agent') || normalized.includes('session')) return ActionTag.SESSION_KEY;
  if (normalized.includes('approv')) return ActionTag.APPROVAL;
  if (normalized.includes('aave') || normalized.includes('supply') || normalized.includes('deposit') || normalized.includes('repay')) {
    return ActionTag.AAVE_POSITION;
  }
  if (normalized.includes('usdc') || normalized.includes('swap')) return ActionTag.USDC_BALANCE;
  if (normalized.includes('eth') || normalized.includes('send') || normalized.includes('withdraw')) return ActionTag.ETH_BALANCE;
  return ActionTag.FULL_SYNC;
}

export function normalizeActionTags(tags, fallbackLabel = '') {
  const input = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const valid = input.filter((tag) => KNOWN_TAGS.has(tag));
  return [...new Set(valid.length ? valid : [labelToActionTag(fallbackLabel)])];
}

export function expandActionTags(tags, fallbackLabel = '') {
  const normalized = normalizeActionTags(tags, fallbackLabel);
  return actionTagsPackage.expandActionTags(normalized);
}
