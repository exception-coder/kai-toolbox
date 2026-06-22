package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerRefView;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 客户资料去重参照库的初始播种。表为空时写入一批样例客户(来源于真实"客户资料"截图),
 * 让去重检索一上来就有底库可比对、前端表格有数据可展示。已有数据则跳过,不覆盖人工/导入的数据。
 *
 * <p>样例里特意放了一个同楼盘陷阱:谭飞服饰与成塔服饰都在罗湖区鹏基工业区、经纬度极近,
 * 但关键字/名称不同——用来验证"地址近 ≠ 重复客户",geo 只能佐证、不能单独定论。
 */
@Component
public class CustomerRefSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CustomerRefSeeder.class);

    private final CustomerRefRepository repo;
    private final Normalizer normalizer;

    public CustomerRefSeeder(CustomerRefRepository repo, Normalizer normalizer) {
        this.repo = repo;
        this.normalizer = normalizer;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (repo.count() > 0) {
            return;
        }
        long now = System.currentTimeMillis();
        for (CustomerRefView c : seedData()) {
            repo.insert(c,
                    normalizer.company(c.custName()),
                    normalizer.company(c.keyword()),
                    normalizer.addr(c.custAddr()),
                    now);
        }
        log.info("[visitor-analysis] 客户参照库为空，已播种 {} 条样例客户", repo.count());
    }

    /** 截图里的客户资料 + 可疑信息候选,字段尽量贴近原系统真实形态。 */
    private static List<CustomerRefView> seedData() {
        return List.of(
                ref(32172, "成塔服饰", "成塔", "深圳成塔服饰", "品牌", "女装", "服装",
                        "广东省", "深圳市", "罗湖区",
                        "广东省深圳市罗湖区鹏基工业区703栋西面402号1栋整栋",
                        "广东省深圳市罗湖区鹏兴路2号",
                        114.163734, 22.560337, "线索库", "普通客户", "李佳玉", "成塔服饰"),
                ref(31845, "深圳雅理服饰", "雅理", "深圳雅理服饰", "品牌", "女装", "服装",
                        "广东省", "深圳市", "龙岗区",
                        "广东省深圳市龙岗区平湖镇禾花岭路2号2楼雅理服饰",
                        "广东省深圳市龙岗区平湖镇禾花岭路2号",
                        114.130300, 22.691500, "线索库", "普通客户", "梁钰", "雅理服饰"),
                ref(30992, "深圳谭飞服饰有限公司", "谭飞", "深圳谭飞服饰有限公司", "品牌", "女装", "服装",
                        "广东省", "深圳市", "罗湖区",
                        "广东省深圳市罗湖区鹏兴路2号鹏基工业区706栋",
                        "广东省深圳市罗湖区鹏兴路2号",
                        114.164100, 22.560400, "线索库", "普通客户", null, "谭飞服饰"),
                ref(28734, "深圳粉蓝衣橱时尚股份有限公司", "粉蓝衣橱", "深圳粉蓝衣橱时尚股份有限公司", "品牌", "女装", "服装",
                        "广东省", "深圳市", "罗湖区",
                        "广东省深圳市罗湖区国威路72号高新技术产业第一园区117栋3楼深圳粉蓝衣橱时尚股份有限公司(莲塘分公司)",
                        "广东省深圳市罗湖区国威路72号",
                        114.180200, 22.575100, "重点客户", "核心客户", "滕柳晴", "粉蓝衣橱"));
    }

    private static CustomerRefView ref(long custId, String name, String keyword, String brand,
                                       String type, String category, String major,
                                       String province, String city, String district,
                                       String addr, String checkin, double lng, double lat,
                                       String level, String property, String creator, String note) {
        return new CustomerRefView(0, custId, name, keyword, brand, type, category, major,
                province, city, district, addr, checkin, lng, lat, level, property, creator, note, 0);
    }
}
