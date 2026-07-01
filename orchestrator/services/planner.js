const { chatComplete } = require('../../shared/openrouter');

const SKILLS = [
  'summarizer', 'code-review', 'research', 'translate',
  'sentiment', 'sql', 'chart', 'extract',
  'legal-review', 'finance', 'transcribe', 'fact-check',
];

async function decomposeJob(jobDescription, availableAgents) {
  const agentList = availableAgents
    .map(a => `- ${a.skill} (${a.name}): ${a.description} @ $${a.price_usdc}/${a.price_unit}`)
    .join('\n');

  try {
    const { text, servedBy } = await chatComplete({
      callerLabel: 'Planner',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are AgentGuild's job planner. Decompose the following job into an ordered list of subtasks, assigning each to the best-fit agent skill from the available list.

Job: "${jobDescription}"

Available agents:
${agentList}

Return ONLY valid JSON (no markdown, no explanation) matching this schema exactly:
{
  "subtasks": [
    {
      "skill": "<skill-from-list>",
      "prompt": "<specific instructions for this agent>",
      "complexity_weight": <float 0.5-3.0>,
      "position": <integer starting at 1>
    }
  ],
  "reasoning": "<one sentence on why this decomposition>"
}

Rules:
- Use only skills from: ${SKILLS.join(', ')}
- 2-6 subtasks maximum
- complexity_weight reflects difficulty: 0.5=trivial, 1.0=normal, 2.0=hard, 3.0=expert
- prompts must be specific and actionable for the assigned skill
- order subtasks so each builds on the previous`,
      }],
    });

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const plan = JSON.parse(cleaned);
    console.log(`[Planner] decomposed into ${plan.subtasks.length} subtasks via ${servedBy}: ${plan.reasoning}`);
    return plan;
  } catch (err) {
    console.error('[Planner] Decomposition failed, using fallback:', err.message);
    return buildFallback(jobDescription);
  }
}

function buildFallback(description) {
  return {
    subtasks: [
      { skill: 'research', prompt: `Research: ${description}`, complexity_weight: 1.5, position: 1 },
      { skill: 'summarizer', prompt: `Summarize the research findings for: ${description}`, complexity_weight: 1.0, position: 2 },
    ],
    reasoning: 'Fallback: research then summarize.',
  };
}

module.exports = { decomposeJob };
