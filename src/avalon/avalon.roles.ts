import { Role } from './avalon.types';

export const ROLES: Record<string, Role> = {
  merlin: {
    id: 'merlin',
    name: '梅林',
    team: 'good',
    description: '知道除莫德雷德外的坏人，终局需要避免被刺客识破。',
  },
  percival: {
    id: 'percival',
    name: '派西维尔',
    team: 'good',
    description: '知道梅林和莫甘娜，但无法区分二者。',
  },
  loyal: {
    id: 'loyal',
    name: '忠臣',
    team: 'good',
    description: '亚瑟的忠臣，需要协助好人完成任务。',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    team: 'evil',
    description: '坏人阵营，终局可以刺杀梅林。',
  },
  morgana: {
    id: 'morgana',
    name: '莫甘娜',
    team: 'evil',
    description: '坏人阵营，会被派西维尔误认为梅林候选。',
  },
  mordred: {
    id: 'mordred',
    name: '莫德雷德',
    team: 'evil',
    description: '坏人阵营，不会被梅林看见。',
  },
  oberon: {
    id: 'oberon',
    name: '奥伯伦',
    team: 'evil',
    description: '坏人阵营，但不与其他坏人互认。',
  },
  minion: {
    id: 'minion',
    name: '爪牙',
    team: 'evil',
    description: '坏人阵营，阻止好人完成任务。',
  },
};

export function getRole(roleId: string): Role | undefined {
  return ROLES[roleId];
}
