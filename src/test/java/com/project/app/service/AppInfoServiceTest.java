package com.project.app.service;

import com.project.app.config.AppProperties;
import com.project.app.web.AppInfoResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AppInfoServiceTest {

    @Test
    void returnsInfoWithConfiguredPropertiesAndCaller() {
        var properties = new AppProperties("app", "1.0.0", "Sample service");
        var service = new AppInfoService(properties);

        AppInfoResponse info = service.getInfo("tester");

        assertThat(info.status()).isEqualTo("UP");
        assertThat(info.name()).isEqualTo("app");
        assertThat(info.version()).isEqualTo("1.0.0");
        assertThat(info.description()).isEqualTo("Sample service");
        assertThat(info.requestedBy()).isEqualTo("tester");
        assertThat(info.timestamp()).isNotNull();
    }

    @Test
    void returnsInfoWhenCallerIsNull() {
        var properties = new AppProperties("app", "1.0.0", null);
        var service = new AppInfoService(properties);

        AppInfoResponse info = service.getInfo(null);

        assertThat(info.status()).isEqualTo("UP");
        assertThat(info.description()).isNull();
        assertThat(info.requestedBy()).isNull();
    }
}
