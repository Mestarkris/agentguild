import { chatComplete } from './llm';

const SKILLS = [
  'summarizer', 'code-review', 'research', 'translate',
  'sentiment', 'sql', 'chart', 'extract',
  'legal-review', 'finance', 'transcribe', 'fact-check',
];

interface SubtaskPlan {
  skill: string;
  prompt: string;
  complexity_weight: number;
  position: number;
}

interface Plan {
  subtasks: SubtaskPlan[];
  reasoning: string;
}

interface AgentRow { skill: string; name: string; description: string; price_usdc: number }

export async function decomposeJob(description: string, agents: AgentRow[]): Promise<Plan> {
  const agentList = agents
    .map(a => `- ${a.skill} (${a.name}): ${a.description} @ $${a.price_usdc}`)
    .join('\n');

  try {
    const { text, servedBy } = await chatComplete({
      maxTokens: 512,
      label: 'Planner',
      messages: [{
        role: 'user',
        content: `You are AgentGuild's job planner. Decompose the following job into an ordered list of subtasks, assigning each to the best-fit agent skill.

Job: "${description}"

Available agents:
${agentList}

Return ONLY valid JSON (no markdown) matching this schema exactly:
{
  "subtasks": [
    {
      "skill": "<skill-from-list>",
      "prompt": "<specific instructions for this agent>",
      "complexity_weight": <float 0.5-3.0>,
      "position": <integer starting at 1>
    }
  ],
  "reasoning": "<one sentence>"
}

Rules:
- Use only skills from: ${SKILLS.join(', ')}
- 1-5 subtasks. Use exactly 1 subtask if a single agent can fully handle the job.
- complexity_weight: 0.5=trivial, 1.0=normal, 2.0=hard, 3.0=expert
- prompts must be specific and actionable
- order so each builds on the previous`,
      }],
    });

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const plan = JSON.parse(cleaned) as Plan;
    console.log(`[Planner] ${plan.subtasks.length} subtasks via ${servedBy}: ${plan.reasoning}`);
    return plan;
  } catch (err) {
    console.error('[Planner] Decomposition failed, using fallback:', (err as Error).message);
    return {
      subtasks: [
        { skill: 'research', prompt: `Research: ${description}`, complexity_weight: 1.5, position: 1 },
        { skill: 'summarizer', prompt: `Summarize the findings for: ${description}`, complexity_weight: 1.0, position: 2 },
      ],
      reasoning: 'Fallback: research then summarize.',
    };
  }
}
