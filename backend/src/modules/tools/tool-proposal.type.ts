export interface ToolProposal {
  type: 'proposal';
  toolName: string;
  preview: string;
  confirmationToken: string;
}

export function isToolProposal(value: unknown): value is ToolProposal {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ToolProposal).type === 'proposal'
  );
}
