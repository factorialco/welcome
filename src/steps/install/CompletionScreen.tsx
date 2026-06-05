import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import BigText from "ink-big-text";
import { useWizard, BRAND_COLOR } from "../../context/index.js";
import type { TaskState } from "./taskState.js";

/** Final summary screen shown once every task has settled. */
export function CompletionScreen({
  tasks,
  totalDuration,
}: {
  tasks: TaskState[];
  totalDuration: number;
}) {
  const { config } = useWizard();
  const completedCount = tasks.filter((t) => t.status === "done").length;
  const skippedCount = tasks.filter((t) => t.status === "skipped").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const failedTasks = tasks.filter((t) => t.status === "failed");

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={failedCount > 0 ? "yellow" : "green"}
      paddingX={2}
      paddingY={1}
      minHeight={14}
      alignItems="center"
      justifyContent="center"
    >
      <Gradient name="rainbow">
        <BigText text={failedCount > 0 ? "DONE*" : "DONE!"} font="chrome" />
      </Gradient>

      <Box marginTop={1} justifyContent="center">
        <Text bold color={BRAND_COLOR}>
          {"─── "}Environment setup{" "}
          {failedCount > 0 ? "completed with errors" : "complete!"}
          {" ───"}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text>
          <Text color="green" bold>
            ✓
          </Text>{" "}
          {completedCount} tasks completed successfully
        </Text>
        {skippedCount > 0 && (
          <Text>
            <Text color="gray">○</Text> {skippedCount} tasks skipped
          </Text>
        )}
        {failedCount > 0 && (
          <Text>
            <Text color="red" bold>
              ✗
            </Text>{" "}
            {failedCount} tasks failed
          </Text>
        )}
        <Text>
          <Text color="green" bold>
            ✓
          </Text>{" "}
          Total time: {(totalDuration / 1000).toFixed(1)}s
        </Text>
      </Box>

      {failedTasks.length > 0 && (
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor="red"
          paddingX={2}
          paddingY={0}
          flexDirection="column"
        >
          <Text bold color="red">
            Failed tasks:
          </Text>
          {failedTasks.map((t) => (
            <Text key={t.id}>
              {"  "}
              {t.icon} {t.name}:{" "}
              <Text color="red">{t.error || "Unknown error"}</Text>
            </Text>
          ))}
        </Box>
      )}

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={BRAND_COLOR}
        paddingX={2}
        paddingY={0}
      >
        <Box flexDirection="column" alignItems="center">
          <Text bold color={BRAND_COLOR}>
            Next steps:
          </Text>
          <Text>
            {"  "}1. <Text bold>cd ~/code/factorial</Text>
          </Text>
          {config.agenticClis.length > 0 && (
            <Text>
              {"  "}2. <Text bold>{config.agenticClis[0]}</Text>
              <Text dimColor> (start coding with AI assistance)</Text>
            </Text>
          )}
          <Text>
            {"  "}
            {config.agenticClis.length > 0 ? "3" : "2"}.{" "}
            <Text bold>.local-dev/quickstart.sh</Text>
            <Text dimColor> (quick start the application)</Text>
          </Text>
          <Text>
            {"  "}
            {config.agenticClis.length > 0 ? "4" : "3"}. Open{" "}
            <Text bold>https://app.local.factorial.dev</Text>
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {failedCount > 0 ? (
            <>
              Press <Text color="gray">r</Text> to retry failed tasks{" "}
              <Text color="gray">|</Text> <Text color="gray">Enter</Text> to
              exit
            </>
          ) : (
            <>
              Happy coding! Press <Text color="gray">Enter</Text> to exit.
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
