package io.fmalhe.socratic;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;

class CodingRulesTest {

    @Test
    void forbidsOptionalGetAndOptionalFields() {
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
                .because("Optional should only be used as a return type, not as a field")
                .check(classes);
    }
}
