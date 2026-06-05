import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { BRAND_COLOR } from "../../context/index.js";
import { StepContainer } from "../../components/StepContainer.js";
import { ProgressBar } from "../../components/UI.js";
import type { TaskState } from "./taskState.js";

/** Live task list with per-task status, subtask progress, and the overall bar. */
export function TaskList({
  tasks,
  percent,
}: {
  tasks: TaskState[];
  percent: number;
}) {
  return (
    <StepContainer
      title="Installing..."
      subtitle={`Running ${tasks.length} tasks with parallel execution`}
    >
      <Box flexDirection="column" gap={0}>
        <ProgressBar percent={percent} color="green" label="Overall Progress" />
        <Text> </Text>

        {tasks.map((task) => {
          if (task.status === "skipped") {
            return (
              <Text key={task.id} dimColor>
                <Text color="gray">{"⊘ "}</Text>
                <Text strikethrough>
                  {task.icon} {task.name}
                </Text>
                <Text> (skipped)</Text>
              </Text>
            );
          }

          const statusIcon =
            task.status === "done"
              ? "✓"
              : task.status === "failed"
                ? "✗"
                : task.status === "running"
                  ? ""
                  : task.status === "waiting"
                    ? "…"
                    : "○";

          const statusColor =
            task.status === "done"
              ? "green"
              : task.status === "failed"
                ? "red"
                : task.status === "running"
                  ? BRAND_COLOR
                  : "gray";

          return (
            <Box key={task.id} flexDirection="column">
              <Text>
                {task.status === "running" ? (
                  <Text color={BRAND_COLOR}>
                    <Spinner type="dots" />{" "}
                  </Text>
                ) : (
                  <Text
                    color={statusColor}
                    bold={task.status === "done" || task.status === "failed"}
                  >
                    {statusIcon}{" "}
                  </Text>
                )}
                <Text
                  color={
                    task.status === "pending"
                      ? "gray"
                      : task.status === "failed"
                        ? "red"
                        : "white"
                  }
                  bold={task.status === "running"}
                  dimColor={task.status === "pending"}
                >
                  {task.icon} {task.name}
                </Text>
                {task.status === "done" && task.duration && (
                  <Text dimColor> ({(task.duration / 1000).toFixed(1)}s)</Text>
                )}
                {task.status === "failed" && <Text color="red"> (FAILED)</Text>}
              </Text>
              {task.status === "running" &&
                task.currentSubtask !== undefined &&
                task.detail && (
                  <Text dimColor>
                    {"    "}
                    {task.detail}{" "}
                    <Text color="gray">
                      ({task.currentSubtask + 1}/{task.subtasks.length})
                    </Text>
                  </Text>
                )}
              {task.status === "failed" && task.error && (
                <Text color="red">
                  {"    "}
                  {task.error}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    </StepContainer>
  );
}
