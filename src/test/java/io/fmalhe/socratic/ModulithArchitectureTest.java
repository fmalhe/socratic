package io.fmalhe.socratic;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

class ModulithArchitectureTest {

    @Test
    void verifiesModularStructureAndGeneratesDocumentation() {
        ApplicationModules modules = ApplicationModules.of(Application.class);
        modules.verify();
        new Documenter(modules)
                .writeDocumentation()
                .writeIndividualModulesAsPlantUml();
    }
}
