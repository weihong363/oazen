export type ProjectIdentity = {
  projectId: string;
  repoRoot?: string;
  gitRemote?: string;
  currentBranch?: string;
  workspaceName: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
};
