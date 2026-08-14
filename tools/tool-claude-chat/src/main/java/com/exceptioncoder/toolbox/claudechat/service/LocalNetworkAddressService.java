package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** 为局域网分享链接选择本机最合适的活动私有 IPv4，避免把 localhost 发给其他设备。 */
@Component
public class LocalNetworkAddressService {
    private static final List<String> VIRTUAL_HINTS = List.of(
            "virtual", "vmware", "vbox", "hyper-v", "docker", "wsl", "tailscale", "zerotier");

    public Optional<String> preferredIpv4() {
        List<Candidate> candidates = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback()) continue;
                Enumeration<InetAddress> addresses = network.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()
                            && !address.isLoopbackAddress() && !address.isLinkLocalAddress()) {
                        candidates.add(new Candidate(address.getHostAddress(), network.getName(),
                                network.getDisplayName(), network.isVirtual(), network.isPointToPoint()));
                    }
                }
            }
        } catch (SocketException ignored) {
            return Optional.empty();
        }
        return choose(candidates).map(Candidate::address);
    }

    static Optional<Candidate> choose(List<Candidate> candidates) {
        return candidates.stream().max(Comparator.comparingInt(LocalNetworkAddressService::score));
    }

    private static int score(Candidate candidate) {
        String address = candidate.address();
        int score = address.startsWith("192.168.") ? 300
                : isPrivate172(address) ? 200
                : address.startsWith("10.") ? 100 : 0;
        String label = (candidate.name() + " " + candidate.displayName()).toLowerCase(Locale.ROOT);
        if (candidate.virtual() || VIRTUAL_HINTS.stream().anyMatch(label::contains)) score -= 1_000;
        if (candidate.pointToPoint()) score -= 500;
        return score;
    }

    private static boolean isPrivate172(String address) {
        String[] parts = address.split("\\.");
        if (parts.length != 4 || !"172".equals(parts[0])) return false;
        try {
            int second = Integer.parseInt(parts[1]);
            return second >= 16 && second <= 31;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    record Candidate(String address, String name, String displayName, boolean virtual, boolean pointToPoint) {
        Candidate {
            name = name == null ? "" : name;
            displayName = displayName == null ? "" : displayName;
        }
    }
}
