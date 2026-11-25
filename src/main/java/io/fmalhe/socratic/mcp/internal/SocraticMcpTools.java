package io.fmalhe.socratic.mcp.internal;

import io.fmalhe.socratic.homework.HomeworkSessionFacade;
import io.fmalhe.socratic.homework.HomeworkSessionId;
import io.fmalhe.socratic.homework.HomeworkSessionResponse;
import io.fmalhe.socratic.profile.LearnerProfileDto;
import io.fmalhe.socratic.profile.ProfileFacade;
import io.fmalhe.socratic.profile.ProfileId;
import io.fmalhe.socratic.progress.ProgressFacade;
import io.fmalhe.socratic.progress.ProgressResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

import java.util.List;

@NullMarked
@Component
@RequiredArgsConstructor
class SocraticMcpTools {

    private final ProfileFacade profileFacade;
    private final ProgressFacade progressFacade;
    private final HomeworkSessionFacade homeworkSessionFacade;

    @Tool(description = "Get the active learner profile including name, age, target/native languages, and dialect rules.")
    LearnerProfileDto getLearnerProfile() {
        return profileFacade.getActiveProfile(ProfileId.DEFAULT);
    }

    @Tool(description = "Get the learner's stars, daily streak, pages read, and recently saved tricky words for quizzes or review.")
    ProgressResponse getProgressAndTrickyWords() {
        return progressFacade.getProgress(ProfileId.DEFAULT);
    }

    @Tool(description = "List recent scanned homework sessions and each exercise's completion status.")
    List<HomeworkSessionResponse> listHomeworkSessions() {
        return homeworkSessionFacade.listSessions(ProfileId.DEFAULT);
    }

    @Tool(description = "Get a specific homework session with all extracted exercises, explanations, tricky words, and ping-pong messages.")
    HomeworkSessionResponse getHomeworkSession(
            @ToolParam(description = "The numeric homework session ID") long sessionId) {
        return homeworkSessionFacade.getSession(ProfileId.DEFAULT, HomeworkSessionId.of(sessionId));
    }
}
