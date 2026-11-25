package io.fmalhe.sqlite.modulith;

import org.jooq.DSLContext;
import org.jspecify.annotations.NullMarked;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventSerializer;

@NullMarked
@AutoConfiguration(
        afterName = "org.springframework.boot.jooq.autoconfigure.JooqAutoConfiguration",
        beforeName = "org.springframework.modulith.events.config.EventPublicationAutoConfiguration")
@ConditionalOnClass(DSLContext.class)
public class SqliteEventPublicationAutoConfiguration {

    @Bean
    EventPublicationRepository sqliteEventPublicationRepository(
            DSLContext dsl, EventSerializer eventSerializer) {
        return new SqliteEventPublicationRepository(dsl, eventSerializer);
    }
}
