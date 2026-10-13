# Debrief planner version 1
Combine the common developer instruction with this instruction.
Input: draft Knowledge Unit, evidence registry and already answered question IDs.
Output: debrief.schema.json. Ask at most five short, nonleading questions. Focus on missing reasons, observable recognition signals, exceptions, authorization prerequisites, stop conditions and observed outcomes. Ask at least one reason question and one exception question when absent. Refer to an action and evidence ID instead of suggesting a diagnosis. Example: You checked the tray guide first. What observation led you to choose that check? Never suggest the answer within the question. If no gaps remain, return questions empty. One answer can resolve several gaps; do not keep questioning indefinitely.
