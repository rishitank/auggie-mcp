export function composePlanInstruction(goal: string, constraints?: string, paths?: string[]) {
  const pathList = (paths && paths.length) ? `\n\nPaths in focus:\n${paths.map(p=>`- ${p}`).join('\n')}` : '';
  return [
    'You are an AI agent. Create a clear, step-by-step plan to achieve the goal in this repository.',
    'Provide: high-level phases, concrete actions, and any risks or prerequisites.',
    constraints ? `Constraints:\n${constraints}` : 'Constraints:\n(none specified)',
    `Goal:\n${goal}`,
    'If stdin provides repository context, use it judiciously. Do not hallucinate paths.',
    pathList
  ].join('\n\n');
}

export function composeReviewInstruction(title?: string, paths?: string[], hasDiff?: boolean) {
  const heading = title ? `Title: ${title}\n\n` : '';
  const filesList = paths && paths.length ? `Files referenced:\n${paths.map(p=>`- ${p}`).join('\n')}` : undefined;
  return heading + [
    'Perform a thorough code review. Identify correctness issues, design concerns, edge cases, and missing tests.',
    'Propose minimal, specific improvements. Use bullet points and cite paths/lines from the provided context.',
    filesList,
    hasDiff ? 'Context comes from stdin as a unified diff.' : 'If stdin provides file content, treat each section as a separate file context.',
  ].filter(Boolean).join('\n\n');
}

