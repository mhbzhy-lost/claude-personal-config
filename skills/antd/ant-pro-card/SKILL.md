---
name: ant-pro-card
description: "ProCard 高级卡片和 StatisticCard 统计卡片，支持分割布局、标签页、数据看板。Use when building React admin dashboards with @ant-design/pro-components and need split-layout cards or KPI statistic cards."
component: ProCard
package: "@ant-design/pro-components"
group: 高阶组件-布局
applies_to:
  markers_any:
    - "dependency: @ant-design/pro-components"
    - "dependency: antd"
tech_stack: [antd]
---

# ProCard & StatisticCard（高级卡片与统计看板）

> 来源：https://procomponents.ant.design/components/card / https://procomponents.ant.design/components/statistic-card

## 核心场景

**ProCard** — 当你需要比 antd `Card` 更强大的卡片容器时使用：
- 卡片内部需要分割布局（左右 / 上下），例如左侧指标 + 右侧图表
- 需要卡片内嵌标签页（tabs）
- 需要栅格化的多卡片网格，支持 gutter 和响应式 colSpan
- 需要可折叠（collapsible）的卡片面板

**StatisticCard** — 当你需要展示 KPI / 统计指标时使用：
- Dashboard 顶部的核心数据看板（DAU、收入、转化率等）
- 多指标横排排列，带分割线
- 指标卡片内嵌迷你图（sparkline / mini chart）
- 需要 trend（趋势箭头）、status（状态色点）等数据语义装饰

**选择指南**：
| 场景 | 选用 |
|---|---|
| 纯内容卡片（文字、列表） | antd `Card` |
| 分割布局 / tabs 卡片 | `ProCard` |
| 统计指标展示 | `StatisticCard` |
| 多指标看板 | `StatisticCard.Group` |

## 安装

```bash
# ProCard 和 StatisticCard 均包含在 pro-components 中
npm install @ant-design/pro-components

# 或单独安装 card 包（较少见）
npm install @ant-design/pro-card
```

```tsx
// 推荐：从 pro-components 统一导入
import { ProCard, StatisticCard } from '@ant-design/pro-components';

// 或从独立包导入
import ProCard from '@ant-design/pro-card';
```

## ProCard 基础用法

最简单的 ProCard，支持 title / extra / bordered / hoverable 等基础属性：

```tsx
import React from 'react';
import { ProCard } from '@ant-design/pro-components';
import { Button } from 'antd';

const BasicCardDemo: React.FC = () => {
  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      {/* 基础卡片 */}
      <ProCard
        title="基础卡片"
        extra={<a href="#">更多</a>}
        bordered
        headerBordered
        style={{ marginBottom: 16 }}
      >
        <p>这是一个基础的 ProCard 示例。</p>
        <p>支持 title、extra、bordered、headerBordered 等常用属性。</p>
      </ProCard>

      {/* 带 tooltip 的卡片 */}
      <ProCard
        title="带提示的卡片"
        tooltip="这里是提示内容，鼠标悬停 title 旁的问号图标可见"
        bordered
        style={{ marginBottom: 16 }}
      >
        <p>tooltip 属性会在标题旁显示一个问号图标。</p>
      </ProCard>

      {/* 可悬停卡片 */}
      <ProCard
        title="可悬停卡片"
        hoverable
        bordered
        style={{ marginBottom: 16, width: 300 }}
      >
        <p>鼠标悬停时会有阴影效果。</p>
      </ProCard>

      {/* 幽灵模式：无背景无内边距，适合嵌套 */}
      <ProCard title="Ghost 模式" ghost>
        <ProCard title="子卡片 A" bordered colSpan={12}>内容 A</ProCard>
        <ProCard title="子卡片 B" bordered colSpan={12}>内容 B</ProCard>
      </ProCard>

      {/* 可折叠卡片 */}
      <ProCard
        title="可折叠卡片"
        bordered
        collapsible
        defaultCollapsed={false}
        style={{ marginTop: 16 }}
      >
        <p>点击标题栏右侧箭头可以展开/折叠。</p>
        <p>设置 defaultCollapsed={true} 可默认折叠。</p>
      </ProCard>

      {/* Loading 状态 */}
      <ProCard
        title="加载中"
        bordered
        loading
        style={{ marginTop: 16 }}
      >
        <p>这段内容在 loading=true 时不可见，显示骨架屏。</p>
      </ProCard>
    </div>
  );
};

export default BasicCardDemo;
```

## ProCard 分割布局

ProCard 最强大的特性是 `split` 属性，可将一张卡片内部分割为多个区域。子 ProCard 通过嵌套方式自动成为分割区域。

```tsx
import React from 'react';
import { ProCard } from '@ant-design/pro-components';

/**
 * 典型看板布局：
 * ┌─────────────┬──────────┐
 * │             │   右上   │
 * │    左侧     ├──────────┤
 * │   (大区域)  │   右下   │
 * └─────────────┴──────────┘
 */
const SplitLayoutDemo: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      {/* 水平分割：左右两栏 */}
      <ProCard
        title="水平分割"
        bordered
        headerBordered
        split="vertical"
        style={{ marginBottom: 24 }}
      >
        <ProCard title="左侧" colSpan="40%">
          左侧内容区域，占 40% 宽度
        </ProCard>
        <ProCard title="右侧">
          右侧内容区域，自动占剩余宽度
        </ProCard>
      </ProCard>

      {/* 垂直分割：上下两栏 */}
      <ProCard
        title="垂直分割"
        bordered
        headerBordered
        split="horizontal"
        style={{ marginBottom: 24 }}
      >
        <ProCard>上部内容</ProCard>
        <ProCard>下部内容</ProCard>
      </ProCard>

      {/* 嵌套分割：复杂看板布局 */}
      <ProCard
        title="复杂看板布局"
        bordered
        headerBordered
        split="vertical"
      >
        {/* 左侧大区域 */}
        <ProCard colSpan="60%">
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            左侧主要内容（图表、表格等）
          </div>
        </ProCard>

        {/* 右侧上下分割 */}
        <ProCard split="horizontal">
          <ProCard>
            <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              右上区域
            </div>
          </ProCard>
          <ProCard>
            <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              右下区域
            </div>
          </ProCard>
        </ProCard>
      </ProCard>
    </div>
  );
};

export default SplitLayoutDemo;
```

### 栅格布局（gutter + colSpan + wrap）

当不需要"分割线"效果，只需要多卡片网格排列时，使用 `gutter` + `colSpan` + `wrap`：

```tsx
import React from 'react';
import { ProCard } from '@ant-design/pro-components';

const GridDemo: React.FC = () => {
  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      {/* 24 栅格系统，类似 antd Row/Col */}
      <ProCard gutter={[16, 16]} wrap ghost>
        <ProCard colSpan={8} bordered>
          <div style={{ height: 100 }}>colSpan=8（1/3 宽度）</div>
        </ProCard>
        <ProCard colSpan={8} bordered>
          <div style={{ height: 100 }}>colSpan=8</div>
        </ProCard>
        <ProCard colSpan={8} bordered>
          <div style={{ height: 100 }}>colSpan=8</div>
        </ProCard>
        <ProCard colSpan={12} bordered>
          <div style={{ height: 100 }}>colSpan=12（1/2 宽度）</div>
        </ProCard>
        <ProCard colSpan={12} bordered>
          <div style={{ height: 100 }}>colSpan=12</div>
        </ProCard>
      </ProCard>

      {/* 响应式 colSpan */}
      <ProCard
        gutter={[16, 16]}
        wrap
        ghost
        style={{ marginTop: 24 }}
      >
        <ProCard
          colSpan={{ xs: 24, sm: 12, md: 8, lg: 6 }}
          bordered
        >
          响应式卡片 A
        </ProCard>
        <ProCard
          colSpan={{ xs: 24, sm: 12, md: 8, lg: 6 }}
          bordered
        >
          响应式卡片 B
        </ProCard>
        <ProCard
          colSpan={{ xs: 24, sm: 12, md: 8, lg: 6 }}
          bordered
        >
          响应式卡片 C
        </ProCard>
        <ProCard
          colSpan={{ xs: 24, sm: 12, md: 8, lg: 6 }}
          bordered
        >
          响应式卡片 D
        </ProCard>
      </ProCard>
    </div>
  );
};

export default GridDemo;
```

## ProCard 标签页

ProCard 内建 tabs 支持，无需额外引入 antd Tabs：

```tsx
import React, { useState } from 'react';
import { ProCard } from '@ant-design/pro-components';

const TabsCardDemo: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string>('tab1');

  return (
    <div style={{ padding: 24 }}>
      {/* 基础标签页卡片 */}
      <ProCard
        tabs={{
          type: 'card', // 'card' | 'line' (默认 line)
          activeKey,
          onChange: setActiveKey,
          items: [
            {
              key: 'tab1',
              label: '概览',
              children: (
                <div style={{ padding: 16 }}>
                  <p>这里是概览 Tab 的内容。</p>
                  <p>ProCard 的 tabs 与 antd Tabs 的 items API 完全一致。</p>
                </div>
              ),
            },
            {
              key: 'tab2',
              label: '详情',
              children: (
                <div style={{ padding: 16 }}>
                  <p>这里是详情 Tab 的内容。</p>
                </div>
              ),
            },
            {
              key: 'tab3',
              label: '设置',
              disabled: true,
              children: <div style={{ padding: 16 }}>被禁用的 Tab</div>,
            },
          ],
        }}
      />

      {/* Tab 在左侧（竖向） */}
      <ProCard
        style={{ marginTop: 24 }}
        tabs={{
          tabPosition: 'left',
          items: [
            {
              key: 'basic',
              label: '基本信息',
              children: <div style={{ padding: 16, minHeight: 200 }}>基本信息表单区域</div>,
            },
            {
              key: 'advanced',
              label: '高级设置',
              children: <div style={{ padding: 16, minHeight: 200 }}>高级设置表单区域</div>,
            },
          ],
        }}
      />
    </div>
  );
};

export default TabsCardDemo;
```

## StatisticCard 统计卡片

StatisticCard 用于展示单个 KPI 指标，通过 `statistic` 属性传入指标信息：

```tsx
import React from 'react';
import { StatisticCard } from '@ant-design/pro-components';

const { Statistic } = StatisticCard;

const StatisticCardDemo: React.FC = () => {
  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      {/* 最基础的统计卡片 */}
      <StatisticCard
        statistic={{
          title: '总销售额',
          value: 126560,
          precision: 2,
          prefix: '¥',
          suffix: '万',
        }}
        style={{ marginBottom: 16 }}
      />

      {/* 带描述（趋势）的统计卡片 */}
      <StatisticCard
        statistic={{
          title: '日活跃用户',
          value: 234500,
          description: (
            <Statistic
              title="较昨日"
              value="8.5%"
              trend="up"
            />
          ),
        }}
        style={{ marginBottom: 16 }}
      />

      {/* 带 footer 的统计卡片 */}
      <StatisticCard
        statistic={{
          title: '新增订单',
          value: 1893,
          description: (
            <Statistic title="周同比" value="12.3%" trend="up" />
          ),
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Statistic title="日均订单" value={270} />
            <Statistic title="转化率" value="60%" />
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {/* 带状态标识的卡片 */}
      <div style={{ display: 'flex', gap: 16 }}>
        <StatisticCard
          statistic={{
            title: '成功',
            value: 93,
            suffix: '%',
            status: 'success',
          }}
        />
        <StatisticCard
          statistic={{
            title: '告警',
            value: 5,
            suffix: '%',
            status: 'warning',
          }}
        />
        <StatisticCard
          statistic={{
            title: '失败',
            value: 2,
            suffix: '%',
            status: 'error',
          }}
        />
      </div>
    </div>
  );
};

export default StatisticCardDemo;
```

## StatisticCard.Group 组合看板

用 `StatisticCard.Group` 将多个 StatisticCard 横排排列，配合 `StatisticCard.Divider` 添加分割线，这是 Dashboard 最常见的 KPI 看板模式：

```tsx
import React from 'react';
import { StatisticCard, ProCard } from '@ant-design/pro-components';
import { Typography } from 'antd';

const { Statistic, Divider } = StatisticCard;

/**
 * 典型 Dashboard 顶部看板：
 * ┌──────────┬──────────┬──────────┬──────────┐
 * │ 总销售额  │  访问量   │  订单量   │ 转化率   │
 * │ ¥126,560 │ 8,846    │  6,560   │  3.2%    │
 * │ ↑12.3%   │ ↓8.5%    │ ↑12.1%   │ ↓0.5%   │
 * └──────────┴──────────┴──────────┴──────────┘
 */
const DashboardKPIPanel: React.FC = () => {
  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      <Typography.Title level={4}>Dashboard 数据概览</Typography.Title>

      {/* KPI 看板 —— 最常用模式 */}
      <StatisticCard.Group direction="row">
        <StatisticCard
          statistic={{
            title: '总销售额',
            value: 126560,
            precision: 2,
            prefix: '¥',
            description: (
              <Statistic title="周同比" value="12.3%" trend="up" />
            ),
          }}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '访问量',
            value: 8846,
            description: (
              <Statistic title="日环比" value="8.5%" trend="down" />
            ),
          }}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '订单量',
            value: 6560,
            description: (
              <Statistic title="周同比" value="12.1%" trend="up" />
            ),
          }}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '转化率',
            value: '3.2%',
            description: (
              <Statistic title="日环比" value="0.5%" trend="down" />
            ),
          }}
        />
      </StatisticCard.Group>

      {/* 带 bordered 和 title 的 Group */}
      <StatisticCard.Group
        title="运营指标"
        direction="row"
        style={{ marginTop: 24 }}
        bordered
      >
        <StatisticCard
          statistic={{
            title: '总用户数',
            value: 1280000,
            suffix: '人',
          }}
          footer={<Statistic title="日新增" value={1280} />}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '活跃用户',
            value: 234500,
            suffix: '人',
          }}
          footer={<Statistic title="活跃率" value="18.3%" />}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '付费用户',
            value: 56000,
            suffix: '人',
          }}
          footer={<Statistic title="付费率" value="4.4%" />}
        />
      </StatisticCard.Group>
    </div>
  );
};

export default DashboardKPIPanel;
```

## 图表集成（与 Ant Design Charts）

StatisticCard 的 `chart` 属性可以放入任何 ReactNode，最常见的是搭配 `@ant-design/charts` 或 `@ant-design/plots` 的迷你图：

```tsx
import React from 'react';
import { StatisticCard, ProCard } from '@ant-design/pro-components';

const { Statistic, Divider } = StatisticCard;

/**
 * 模拟迷你图组件 —— 实际项目中替换为:
 *   import { TinyArea, TinyColumn, Progress } from '@ant-design/plots';
 *
 * 这里用简单 div 占位，展示集成模式。
 */
const MiniAreaChart: React.FC<{ data: number[]; color?: string }> = ({ data, color = '#1890ff' }) => {
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 46 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: color,
            borderRadius: 2,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
};

const MiniProgressBar: React.FC<{ percent: number }> = ({ percent }) => (
  <div style={{ width: '100%', height: 8, background: '#f0f0f0', borderRadius: 4 }}>
    <div
      style={{
        width: `${percent}%`,
        height: '100%',
        background: percent > 80 ? '#52c41a' : percent > 50 ? '#1890ff' : '#faad14',
        borderRadius: 4,
      }}
    />
  </div>
);

/**
 * 统计卡片 + 图表 的三种布局模式：
 * 1. chart 在右侧（默认 chartPlacement='right'）
 * 2. chart 在左侧（chartPlacement='left'）
 * 3. chart 在底部（chartPlacement='bottom'）
 */
const ChartIntegrationDemo: React.FC = () => {
  const areaData = [264, 417, 438, 887, 309, 397, 550, 234, 765, 456, 632, 589];
  const areaData2 = [120, 230, 150, 340, 290, 410, 380, 500, 440, 520, 490, 600];

  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      {/* 指标 + 右侧迷你图 —— 最常见 */}
      <StatisticCard.Group direction="row" style={{ marginBottom: 24 }}>
        <StatisticCard
          statistic={{
            title: '总流量',
            value: 597380,
            description: (
              <Statistic title="日环比" value="6.15%" trend="up" />
            ),
          }}
          chart={<MiniAreaChart data={areaData} />}
          chartPlacement="right"
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '总订单',
            value: 12480,
            description: (
              <Statistic title="日环比" value="3.2%" trend="down" />
            ),
          }}
          chart={<MiniAreaChart data={areaData2} color="#5ad8a6" />}
          chartPlacement="right"
        />
      </StatisticCard.Group>

      {/* chart 在底部 —— 适合大面积图表 */}
      <ProCard gutter={[16, 16]} wrap ghost>
        <ProCard colSpan={12}>
          <StatisticCard
            title="流量趋势"
            statistic={{
              title: '本月流量',
              value: 597380,
            }}
            chart={
              <div style={{ height: 80, marginTop: 8 }}>
                <MiniAreaChart data={areaData} />
              </div>
            }
            chartPlacement="bottom"
          />
        </ProCard>
        <ProCard colSpan={12}>
          <StatisticCard
            title="任务完成率"
            statistic={{
              title: '完成率',
              value: '78%',
            }}
            chart={
              <div style={{ marginTop: 16, padding: '0 24px' }}>
                <MiniProgressBar percent={78} />
              </div>
            }
            chartPlacement="bottom"
          />
        </ProCard>
      </ProCard>

      {/* 实际项目中使用 @ant-design/plots 示例（伪代码） */}
      {/*
      import { TinyArea, TinyColumn, RingProgress } from '@ant-design/plots';

      <StatisticCard
        statistic={{ title: '销售额', value: 126560 }}
        chart={
          <TinyArea
            height={46}
            width={120}
            data={[264, 417, 438, 887, 309, 397, 550]}
            smooth
          />
        }
        chartPlacement="right"
      />
      */}
    </div>
  );
};

export default ChartIntegrationDemo;
```

## 完整 Dashboard 页面示例

综合运用 ProCard 和 StatisticCard 搭建一个典型的管理后台 Dashboard 页面：

```tsx
import React, { useState } from 'react';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import { Table, Tag, Typography, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Statistic, Divider } = StatisticCard;

// ---------- 模拟数据 ----------

interface OrderItem {
  key: string;
  name: string;
  amount: number;
  status: 'success' | 'processing' | 'error';
}

const recentOrders: OrderItem[] = [
  { key: '1', name: '商品 A - 季度采购', amount: 23400, status: 'success' },
  { key: '2', name: '服务 B - 年度续费', amount: 56000, status: 'processing' },
  { key: '3', name: '商品 C - 紧急补货', amount: 8900, status: 'error' },
  { key: '4', name: '服务 D - 月度结算', amount: 12300, status: 'success' },
];

const orderColumns: ColumnsType<OrderItem> = [
  { title: '订单名称', dataIndex: 'name', key: 'name' },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    render: (v: number) => `¥${v.toLocaleString()}`,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    render: (s: string) => {
      const colorMap: Record<string, string> = { success: 'green', processing: 'blue', error: 'red' };
      const labelMap: Record<string, string> = { success: '已完成', processing: '进行中', error: '异常' };
      return <Tag color={colorMap[s]}>{labelMap[s]}</Tag>;
    },
  },
];

// 简易迷你柱状图
const MiniBar: React.FC<{ data: number[] }> = ({ data }) => {
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 46 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: '#1890ff',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
};

/**
 * 完整 Dashboard 页面布局：
 *
 * ┌──────────┬──────────┬──────────┬──────────┐
 * │ 总销售额  │  访问量   │  订单量   │ 转化率   │  <-- KPI 看板
 * └──────────┴──────────┴──────────┴──────────┘
 * ┌──────────────────────┬─────────────────────┐
 * │                      │                     │
 * │    销售趋势 (图表)    │   热门商品 (图表)    │  <-- ProCard split
 * │                      │                     │
 * ├──────────────────────┴─────────────────────┤
 * │                                            │
 * │              最近订单 (表格)                 │  <-- ProCard tabs
 * │                                            │
 * └────────────────────────────────────────────┘
 */
const DashboardPage: React.FC = () => {
  const [tabKey, setTabKey] = useState<string>('all');

  return (
    <div style={{ padding: 24, background: '#f0f2f5' }}>
      {/* 第一行：KPI 指标看板 */}
      <StatisticCard.Group direction="row" style={{ marginBottom: 24 }}>
        <StatisticCard
          statistic={{
            title: '总销售额',
            value: 126560,
            precision: 2,
            prefix: '¥',
            description: <Statistic title="周同比" value="12.3%" trend="up" />,
          }}
          chart={<MiniBar data={[20, 50, 40, 70, 30, 60, 45]} />}
          chartPlacement="right"
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '访问量',
            value: 88460,
            description: <Statistic title="日环比" value="8.5%" trend="down" />,
          }}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '订单量',
            value: 6560,
            description: <Statistic title="周同比" value="12.1%" trend="up" />,
          }}
        />
        <Divider type="vertical" />
        <StatisticCard
          statistic={{
            title: '转化率',
            value: '3.2%',
            description: <Statistic title="日环比" value="0.5%" trend="down" />,
          }}
        />
      </StatisticCard.Group>

      {/* 第二行：左右分割布局 */}
      <ProCard
        split="vertical"
        bordered
        headerBordered
        style={{ marginBottom: 24 }}
      >
        <ProCard title="销售趋势" colSpan="60%">
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 实际项目放 @ant-design/plots 的 Area / Line chart */}
            <Typography.Text type="secondary">
              此处放置面积图 / 折线图 —— 使用 @ant-design/plots
            </Typography.Text>
          </div>
        </ProCard>
        <ProCard title="热门商品 TOP5">
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 实际项目放 @ant-design/plots 的 Bar chart */}
            <Typography.Text type="secondary">
              此处放置条形图 / 饼图
            </Typography.Text>
          </div>
        </ProCard>
      </ProCard>

      {/* 第三行：带标签页的订单卡片 */}
      <ProCard
        tabs={{
          type: 'card',
          activeKey: tabKey,
          onChange: setTabKey,
          items: [
            {
              key: 'all',
              label: '全部订单',
              children: (
                <Table<OrderItem>
                  columns={orderColumns}
                  dataSource={recentOrders}
                  pagination={false}
                  size="small"
                />
              ),
            },
            {
              key: 'processing',
              label: '进行中',
              children: (
                <Table<OrderItem>
                  columns={orderColumns}
                  dataSource={recentOrders.filter((o) => o.status === 'processing')}
                  pagination={false}
                  size="small"
                />
              ),
            },
            {
              key: 'error',
              label: '异常',
              children: (
                <Table<OrderItem>
                  columns={orderColumns}
                  dataSource={recentOrders.filter((o) => o.status === 'error')}
                  pagination={false}
                  size="small"
                />
              ),
            },
          ],
        }}
        bordered
      />
    </div>
  );
};

export default DashboardPage;
```

## 关键 Props 速查

### ProCard

| Prop | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `title` | `ReactNode` | - | 卡片标题 |
| `extra` | `ReactNode` | - | 标题栏右侧内容 |
| `tooltip` | `string` | - | 标题旁问号提示 |
| `bordered` | `boolean` | `true` | 显示边框 |
| `headerBordered` | `boolean` | `false` | 标题栏下方分割线 |
| `hoverable` | `boolean` | `false` | 悬停阴影效果 |
| `ghost` | `boolean` | `false` | 无背景无内边距（嵌套时常用） |
| `loading` | `boolean \| ReactNode` | `false` | 加载状态 / 自定义骨架屏 |
| `split` | `'vertical' \| 'horizontal'` | - | 分割方向（核心特性） |
| `colSpan` | `number \| string \| ResponsiveColSpan` | `24` | 栅格占比（24 栅格），支持数字、百分比字符串、响应式对象 |
| `gutter` | `number \| [number, number]` | `0` | 子卡片间距 `[水平, 垂直]` |
| `wrap` | `boolean` | `false` | 子卡片自动换行 |
| `direction` | `'row' \| 'column'` | - | 子元素排列方向 |
| `collapsible` | `boolean` | `false` | 可折叠 |
| `defaultCollapsed` | `boolean` | `false` | 默认折叠状态 |
| `tabs` | `TabsProps` | - | 标签页配置，API 同 antd Tabs |

### StatisticCard

| Prop | 类型 | 说明 |
|---|---|---|
| `statistic` | `StatisticProps` | 统计指标配置（见下表） |
| `chart` | `ReactNode` | 图表区域 |
| `chartPlacement` | `'left' \| 'right' \| 'bottom'` | 图表位置（默认 `right`） |
| `footer` | `ReactNode` | 底部辅助信息 |
| `loading` | `boolean` | 加载状态 |

### StatisticCard.Statistic（statistic 属性对象）

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | `ReactNode` | 指标标题 |
| `value` | `string \| number` | 指标值 |
| `precision` | `number` | 小数精度 |
| `prefix` | `ReactNode` | 前缀（如 ¥） |
| `suffix` | `ReactNode` | 后缀（如 万、%） |
| `description` | `ReactNode` | 描述区域，常放嵌套 `<Statistic trend="up" />` |
| `trend` | `'up' \| 'down'` | 趋势箭头（自动着色：up 红 / down 绿） |
| `status` | `'success' \| 'error' \| 'warning' \| 'default' \| 'processing'` | 状态色点 |
| `icon` | `ReactNode` | 图标 |
| `layout` | `'horizontal' \| 'vertical'` | 排列方向 |
| `valueStyle` | `CSSProperties` | 自定义值样式 |

### 组合子组件

| 组件 | 说明 |
|---|---|
| `StatisticCard.Group` | 将多个 StatisticCard 组合为一行，props 同 ProCard |
| `StatisticCard.Divider` | 分割线，`type="vertical"` 竖线（横排时用） |
| `ProCard.Group` | 同 ProCard，语义化别名 |

## 注意事项

1. **split vs gutter 不要混用**：`split` 产生的是"同一张卡片内部的分割"（有分割线，无间距），`gutter` + `colSpan` 产生的是"多张独立卡片的网格"（有间距，无分割线）。两者是不同的布局模式，不要在同一层级混用。

2. **colSpan 的 24 栅格**：ProCard 使用 24 栅格系统，`colSpan={8}` 表示占 1/3 宽度。也可用百分比字符串 `colSpan="40%"`。响应式写法：`colSpan={{ xs: 24, sm: 12, md: 8 }}`。

3. **StatisticCard.Group 必须直接包裹 StatisticCard**：中间不要插入 `<div>` 等节点，否则分割线和布局会失效。

4. **trend 颜色语义**：`trend="up"` 默认红色（涨），`trend="down"` 默认绿色（跌）。这是中国股市配色，如需反转（国际惯例），自行通过 `valueStyle` 覆盖颜色。

5. **loading 骨架屏**：ProCard 和 StatisticCard 的 `loading={true}` 会自动显示骨架屏，不需要手动包 `<Skeleton>`。也可传入自定义 ReactNode 替代默认骨架。

6. **ghost 模式用途**：当你用 ProCard 仅作布局容器（提供 gutter / colSpan 能力），不需要可见的卡片外观时，加 `ghost` 去掉背景和内边距。

7. **包导入路径**：推荐从 `@ant-design/pro-components` 导入。单独装 `@ant-design/pro-card` 也可以，但要注意版本与其他 pro-components 包的兼容性。

8. **tabs.items 优于 tabs.children**：与 antd Tabs 一致，使用 `items` 数组配置标签页（5.x 推荐写法），不要使用已废弃的 `TabPane` 子元素写法。
