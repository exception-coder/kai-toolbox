package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LocalNetworkAddressServiceTest {
    @Test
    void prefersPhysicalLanAddressOverVirtualAdapters() {
        var selected = LocalNetworkAddressService.choose(List.of(
                new LocalNetworkAddressService.Candidate("172.28.16.1", "vEthernet", "Hyper-V Virtual Ethernet", false, false),
                new LocalNetworkAddressService.Candidate("10.10.0.8", "vpn0", "Company VPN", false, true),
                new LocalNetworkAddressService.Candidate("192.168.100.102", "eth0", "Realtek Ethernet", false, false)));

        assertThat(selected).get().extracting(LocalNetworkAddressService.Candidate::address)
                .isEqualTo("192.168.100.102");
    }
}
