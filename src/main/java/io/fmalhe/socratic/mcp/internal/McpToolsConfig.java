package io.fmalhe.socratic.mcp.internal;

import org.jspecify.annotations.NullMarked;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@NullMarked
@Configuration
class McpToolsConfig {

    @Bean
    ToolCallbackProvider socraticToolCallbackProvider(SocraticMcpTools tools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(tools)
                .build();
    }
}
