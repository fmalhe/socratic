package io.fmalhe.socratic;

import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;

class CodingRulesTest {

    @Test
    void forbidsOptionalGetOptionalFieldsAndOptionalControllerParameters() {
        var classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .withImportOption(location -> !location.contains("/jooq/"))
                .importPackages("io.fmalhe.socratic", "io.fmalhe.sqlite");

        noClasses()
                .should().callMethod(Optional.class, "get")
                .because("Use orElse(), orElseGet(), orElseThrow(), or map() instead of Optional.get()")
                .check(classes);

        noFields()
                .should().haveRawType(Optional.class)
                .because("Optional should only be used as a return type, never as a field or record component")
                .check(classes);

        methods()
                .that().areDeclaredInClassesThat().areAnnotatedWith(RestController.class)
                .should(notHaveOptionalParameters())
                .because("Controllers should use argument resolvers or request objects instead of Optional parameters")
                .check(classes);
    }

    private static ArchCondition<JavaMethod> notHaveOptionalParameters() {
        return new ArchCondition<>("not have Optional parameters") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                var hasOptionalParam = method.getRawParameterTypes().stream()
                        .anyMatch(param -> param.isEquivalentTo(Optional.class));
                if (hasOptionalParam) {
                    events.add(SimpleConditionEvent.violated(
                            method, method.getFullName() + " declares an Optional parameter"));
                }
            }
        };
    }
}
