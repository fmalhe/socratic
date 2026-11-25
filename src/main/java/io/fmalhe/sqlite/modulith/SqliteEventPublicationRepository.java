package io.fmalhe.sqlite.modulith;

import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jooq.Record6;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.modulith.events.EventPublication.Status;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static io.fmalhe.socratic.jooq.Tables.EVENT_PUBLICATION;

@NullMarked
@RequiredArgsConstructor
public class SqliteEventPublicationRepository implements EventPublicationRepository {

    private final DSLContext dsl;
    private final EventSerializer serializer;

    @Override
    public TargetEventPublication create(TargetEventPublication publication) {
        String serialized = String.valueOf(serializer.serialize(publication.getEvent()));
        dsl.insertInto(EVENT_PUBLICATION)
                .set(EVENT_PUBLICATION.ID, publication.getIdentifier().toString())
                .set(EVENT_PUBLICATION.LISTENER_ID, publication.getTargetIdentifier().getValue())
                .set(EVENT_PUBLICATION.EVENT_TYPE, publication.getEvent().getClass().getName())
                .set(EVENT_PUBLICATION.SERIALIZED_EVENT, serialized)
                .set(EVENT_PUBLICATION.PUBLICATION_DATE, publication.getPublicationDate().toString())
                .set(EVENT_PUBLICATION.COMPLETION_DATE, (String) null)
                .execute();
        return publication;
    }

    @Override
    public void markCompleted(Object event, PublicationTargetIdentifier targetIdentifier, Instant completionDate) {
        String serialized = String.valueOf(serializer.serialize(event));
        dsl.update(EVENT_PUBLICATION)
                .set(EVENT_PUBLICATION.COMPLETION_DATE, completionDate.toString())
                .where(EVENT_PUBLICATION.SERIALIZED_EVENT.eq(serialized))
                .and(EVENT_PUBLICATION.LISTENER_ID.eq(targetIdentifier.getValue()))
                .and(EVENT_PUBLICATION.COMPLETION_DATE.isNull())
                .execute();
    }

    @Override
    public void markCompleted(UUID identifier, Instant completionDate) {
        dsl.update(EVENT_PUBLICATION)
                .set(EVENT_PUBLICATION.COMPLETION_DATE, completionDate.toString())
                .where(EVENT_PUBLICATION.ID.eq(identifier.toString()))
                .execute();
    }

    @Override
    public List<TargetEventPublication> findIncompletePublications() {
        return dsl.select(
                        EVENT_PUBLICATION.ID,
                        EVENT_PUBLICATION.LISTENER_ID,
                        EVENT_PUBLICATION.EVENT_TYPE,
                        EVENT_PUBLICATION.SERIALIZED_EVENT,
                        EVENT_PUBLICATION.PUBLICATION_DATE,
                        EVENT_PUBLICATION.COMPLETION_DATE)
                .from(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.COMPLETION_DATE.isNull())
                .orderBy(EVENT_PUBLICATION.PUBLICATION_DATE.asc())
                .fetch(this::toPublication);
    }

    @Override
    public List<TargetEventPublication> findIncompletePublicationsPublishedBefore(Instant instant) {
        return dsl.select(
                        EVENT_PUBLICATION.ID,
                        EVENT_PUBLICATION.LISTENER_ID,
                        EVENT_PUBLICATION.EVENT_TYPE,
                        EVENT_PUBLICATION.SERIALIZED_EVENT,
                        EVENT_PUBLICATION.PUBLICATION_DATE,
                        EVENT_PUBLICATION.COMPLETION_DATE)
                .from(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.COMPLETION_DATE.isNull())
                .and(EVENT_PUBLICATION.PUBLICATION_DATE.lt(instant.toString()))
                .orderBy(EVENT_PUBLICATION.PUBLICATION_DATE.asc())
                .fetch(this::toPublication);
    }

    @Override
    public Optional<TargetEventPublication> findIncompletePublicationsByEventAndTargetIdentifier(
            Object event, PublicationTargetIdentifier targetIdentifier) {
        String serialized = String.valueOf(serializer.serialize(event));
        return dsl.select(
                        EVENT_PUBLICATION.ID,
                        EVENT_PUBLICATION.LISTENER_ID,
                        EVENT_PUBLICATION.EVENT_TYPE,
                        EVENT_PUBLICATION.SERIALIZED_EVENT,
                        EVENT_PUBLICATION.PUBLICATION_DATE,
                        EVENT_PUBLICATION.COMPLETION_DATE)
                .from(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.SERIALIZED_EVENT.eq(serialized))
                .and(EVENT_PUBLICATION.LISTENER_ID.eq(targetIdentifier.getValue()))
                .and(EVENT_PUBLICATION.COMPLETION_DATE.isNull())
                .fetchOptional(this::toPublication);
    }

    @Override
    public void deletePublications(List<UUID> identifiers) {
        if (identifiers.isEmpty()) {
            return;
        }
        List<String> ids = identifiers.stream().map(UUID::toString).toList();
        dsl.deleteFrom(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.ID.in(ids))
                .execute();
    }

    @Override
    public void deleteCompletedPublications() {
        dsl.deleteFrom(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.COMPLETION_DATE.isNotNull())
                .execute();
    }

    @Override
    public void deleteCompletedPublicationsBefore(Instant instant) {
        dsl.deleteFrom(EVENT_PUBLICATION)
                .where(EVENT_PUBLICATION.COMPLETION_DATE.isNotNull())
                .and(EVENT_PUBLICATION.COMPLETION_DATE.lt(instant.toString()))
                .execute();
    }

    private TargetEventPublication toPublication(
            Record6<String, String, String, String, String, String> record) {
        UUID id = UUID.fromString(record.get(EVENT_PUBLICATION.ID));
        PublicationTargetIdentifier target = PublicationTargetIdentifier.of(record.get(EVENT_PUBLICATION.LISTENER_ID));
        Class<?> eventType = loadEventClass(record.get(EVENT_PUBLICATION.EVENT_TYPE));
        Object event = serializer.deserialize(record.get(EVENT_PUBLICATION.SERIALIZED_EVENT), eventType);
        Instant publicationDate = Instant.parse(record.get(EVENT_PUBLICATION.PUBLICATION_DATE));
        String completionRaw = record.get(EVENT_PUBLICATION.COMPLETION_DATE);
        Instant completionDate = completionRaw != null ? Instant.parse(completionRaw) : null;

        return new SqliteTargetEventPublication(id, target, event, publicationDate, completionDate);
    }

    private static Class<?> loadEventClass(String className) {
        try {
            return Class.forName(className);
        } catch (ClassNotFoundException ex) {
            throw new IllegalStateException("Cannot load event class: " + className, ex);
        }
    }

    private static final class SqliteTargetEventPublication implements TargetEventPublication {

        private final UUID id;
        private final PublicationTargetIdentifier targetIdentifier;
        private final Object event;
        private final Instant publicationDate;
        private @Nullable Instant completionDate;

        private SqliteTargetEventPublication(
                UUID id,
                PublicationTargetIdentifier targetIdentifier,
                Object event,
                Instant publicationDate,
                @Nullable Instant completionDate) {
            this.id = id;
            this.targetIdentifier = targetIdentifier;
            this.event = event;
            this.publicationDate = publicationDate;
            this.completionDate = completionDate;
        }

        @Override
        public UUID getIdentifier() {
            return id;
        }

        @Override
        public Object getEvent() {
            return event;
        }

        @Override
        public PublicationTargetIdentifier getTargetIdentifier() {
            return targetIdentifier;
        }

        @Override
        public Instant getPublicationDate() {
            return publicationDate;
        }

        @Override
        public Optional<Instant> getCompletionDate() {
            return Optional.ofNullable(completionDate);
        }

        @Override
        public boolean isCompleted() {
            return completionDate != null;
        }

        @Override
        public Status getStatus() {
            return completionDate != null ? Status.COMPLETED : Status.PUBLISHED;
        }

        @Override
        public int getCompletionAttempts() {
            return 0;
        }

        @Override
        public @Nullable Instant getLastResubmissionDate() {
            return null;
        }

        @Override
        public void markCompleted(Instant instant) {
            this.completionDate = instant;
        }
    }
}
