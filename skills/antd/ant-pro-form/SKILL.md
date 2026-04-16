---
name: ant-pro-form
description: "ProForm 高级表单，内置字段类型、布局、ModalForm/DrawerForm/StepsForm。"
tech_stack: [antd]
language: [typescript]
---

# ProForm（高级表单）

> 来源：https://procomponents.ant.design/components/form

## 核心场景（何时用 ProForm 而不是普通 Form）

ProForm 是 antd Form 的上层封装，**不是替代品**。以下场景推荐使用 ProForm：

1. **后台管理的 CRUD 表单** -- 新建/编辑实体（用户、订单、商品），需要 Text/Select/DatePicker 等常见字段的快速组合
2. **弹窗表单** -- 点击按钮弹出 Modal 或 Drawer 填写并提交（ModalForm / DrawerForm）
3. **分步向导** -- 多步骤表单，步骤间有数据依赖（StepsForm）
4. **动态增删列表** -- 表单内嵌可增删的子项列表（ProFormList）
5. **字段联动** -- 某字段值变化时，另一字段的显隐/选项跟着变（ProFormDependency）

**不适用场景**：高度定制化的表单布局、需要精确控制每个 DOM 节点的场景 -- 直接用 antd Form。

## 安装

```bash
# 推荐：统一安装 pro-components（包含 ProForm、ProTable、ProLayout 等）
npm install @ant-design/pro-components

# 对等依赖
npm install antd @ant-design/icons
```

import 方式：

```tsx
import {
  ProForm,
  ProFormText,
  ProFormSelect,
  ProFormDatePicker,
  ProFormDateRangePicker,
  ProFormTextArea,
  ProFormDigit,
  ProFormSwitch,
  ProFormCheckbox,
  ProFormRadio,
  ProFormUploadButton,
  ProFormUploadDragger,
  ProFormList,
  ProFormGroup,
  ProFormDependency,
  ModalForm,
  DrawerForm,
  StepsForm,
} from '@ant-design/pro-components';
```

## 基础 ProForm：完整示例

一个包含常用字段类型的标准表单，带校验、初始值和提交处理：

```tsx
import React from 'react';
import {
  ProForm,
  ProFormText,
  ProFormSelect,
  ProFormDateRangePicker,
  ProFormTextArea,
  ProFormDigit,
  ProFormRadio,
  ProFormDependency,
} from '@ant-design/pro-components';
import { Card, message } from 'antd';

interface TaskFormValues {
  title: string;
  date: [string, string];
  goal: string;
  priority: 'high' | 'medium' | 'low';
  assignee: string;
  weight?: number;
  visibility: '1' | '2' | '3';
  visibleTo?: string[];
}

const BasicFormExample: React.FC = () => {
  const onFinish = async (values: TaskFormValues) => {
    console.log('表单值:', values);
    // 调用 API 提交
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    message.success('提交成功');
  };

  return (
    <Card>
      <ProForm<TaskFormValues>
        name="basic"
        layout="vertical"
        initialValues={{
          priority: 'medium',
          visibility: '1',
        }}
        onFinish={onFinish}
        // 提交按钮自动渲染（提交 + 重置），无需手动写 Button
      >
        <ProFormText
          name="title"
          label="任务标题"
          width="md"
          placeholder="请输入任务标题"
          rules={[{ required: true, message: '请输入任务标题' }]}
        />

        <ProFormDateRangePicker
          name="date"
          label="起止日期"
          width="md"
          rules={[{ required: true, message: '请选择日期范围' }]}
        />

        <ProFormTextArea
          name="goal"
          label="任务描述"
          width="xl"
          placeholder="请输入任务描述"
          rules={[{ required: true, message: '请输入描述' }]}
        />

        <ProFormSelect
          name="assignee"
          label="负责人"
          width="md"
          rules={[{ required: true, message: '请选择负责人' }]}
          options={[
            { label: '张三', value: 'zhangsan' },
            { label: '李四', value: 'lisi' },
          ]}
          // 也可用 request 异步加载选项：
          // request={async () => {
          //   const res = await fetch('/api/users');
          //   return res.json(); // 返回 { label, value }[]
          // }}
        />

        <ProFormDigit
          name="weight"
          label="权重"
          width="xs"
          min={0}
          max={100}
          fieldProps={{
            formatter: (value) => `${value || 0}%`,
            parser: (value) => Number(value ? value.replace('%', '') : '0'),
          }}
        />

        <ProFormRadio.Group
          name="visibility"
          label="可见范围"
          options={[
            { label: '公开', value: '1' },
            { label: '部分可见', value: '2' },
            { label: '仅自己', value: '3' },
          ]}
        />

        {/* 字段联动：visibility 为 '2' 时显示额外选择器 */}
        <ProFormDependency name={['visibility']}>
          {({ visibility }) => {
            if (visibility !== '2') return null;
            return (
              <ProFormSelect
                name="visibleTo"
                label="可见人员"
                width="md"
                mode="multiple"
                options={[
                  { label: '团队A', value: 'team-a' },
                  { label: '团队B', value: 'team-b' },
                ]}
              />
            );
          }}
        </ProFormDependency>
      </ProForm>
    </Card>
  );
};

export default BasicFormExample;
```

**要点**：
- `onFinish` 返回 `true` 或 resolve 即表示提交成功（自动关闭 Modal/Drawer）
- `width` 可选值：`'xs' | 'sm' | 'md' | 'lg' | 'xl'`，对应预设宽度，不传则 100%
- `fieldProps` 透传给底层 antd 组件（如 Input、Select、InputNumber 等）
- `rules` 与 antd Form.Item 的 `rules` 完全一致

## 字段类型速查

每种 ProForm 字段组件封装了对应的 antd 组件，自带 label + 校验 + 宽度控制：

```tsx
// 文本输入
<ProFormText name="name" label="姓名" placeholder="请输入" />
<ProFormText.Password name="password" label="密码" />

// 数字输入
<ProFormDigit name="age" label="年龄" min={1} max={120} />

// 文本域
<ProFormTextArea name="remark" label="备注" />

// 下拉选择（支持 options / valueEnum / request 三种数据源）
<ProFormSelect
  name="status"
  label="状态"
  valueEnum={{ active: '激活', inactive: '停用' }}
/>
<ProFormSelect
  name="city"
  label="城市"
  request={async () => [{ label: '北京', value: 'bj' }]}
/>

// 日期 / 日期范围
<ProFormDatePicker name="birthday" label="生日" />
<ProFormDateRangePicker name="period" label="时间段" />

// 时间
<ProFormTimePicker name="alarm" label="提醒时间" />

// 开关
<ProFormSwitch name="enabled" label="启用" />

// 单选组
<ProFormRadio.Group
  name="gender"
  label="性别"
  options={[
    { label: '男', value: 'male' },
    { label: '女', value: 'female' },
  ]}
/>

// 多选组
<ProFormCheckbox.Group
  name="tags"
  label="标签"
  options={['前端', '后端', '设计']}
/>

// 文件上传（按钮式 / 拖拽式）
<ProFormUploadButton name="file" label="附件" max={3} />
<ProFormUploadDragger name="files" label="拖拽上传" max={5} />

// 级联选择
<ProFormCascader
  name="area"
  label="地区"
  fieldProps={{ options: areaOptions }}
/>

// 树形选择
<ProFormTreeSelect
  name="dept"
  label="部门"
  request={async () => treeData}
/>

// 颜色选择
<ProFormColorPicker name="color" label="主题色" />

// 滑动条
<ProFormSlider name="volume" label="音量" />

// 评分
<ProFormRate name="score" label="评分" />

// 分割线（纯布局，不是字段）
<ProFormDivider />
```

**通用 Props（所有字段组件共享）**：

| Prop | 类型 | 说明 |
|------|------|------|
| `name` | `string \| string[]` | 字段名（支持嵌套路径 `['addr', 'city']`） |
| `label` | `ReactNode` | 标签 |
| `width` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| number` | 输入框宽度 |
| `tooltip` | `string` | 标签旁的问号提示 |
| `placeholder` | `string` | 占位符 |
| `rules` | `Rule[]` | antd 校验规则 |
| `fieldProps` | `object` | 透传给底层 antd 组件的 props |
| `formItemProps` | `object` | 透传给 Form.Item 的 props |
| `disabled` | `boolean` | 禁用 |
| `readonly` | `boolean` | 只读模式（显示文本而非输入框） |
| `initialValue` | `any` | 字段级初始值 |
| `convertValue` | `(value) => any` | 从表单值到组件值的转换 |
| `transform` | `(value, name, all) => object` | 提交时的值转换 |

## ModalForm / DrawerForm

适用于"点击按钮 -> 弹窗填表 -> 提交关闭"的新建/编辑场景。

### ModalForm 完整示例

```tsx
import React, { useRef } from 'react';
import {
  ModalForm,
  ProFormText,
  ProFormSelect,
  ProFormDatePicker,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Button, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface UserFormValues {
  name: string;
  email: string;
  role: string;
  joinDate: string;
  remark?: string;
}

const CreateUserModal: React.FC = () => {
  const formRef = useRef<ProFormInstance>();

  return (
    <ModalForm<UserFormValues>
      title="新建用户"
      // trigger 是弹窗的触发按钮，点击后自动打开 Modal
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          新建用户
        </Button>
      }
      formRef={formRef}
      // 也可用 open + onOpenChange 受控模式：
      // open={visible}
      // onOpenChange={setVisible}
      width={520}
      modalProps={{
        destroyOnClose: true, // 关闭时销毁表单，避免残留数据
        maskClosable: false,
      }}
      submitTimeout={2000} // 提交按钮 loading 超时时间
      onFinish={async (values) => {
        console.log('提交:', values);
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        message.success('创建成功');
        return true; // 返回 true 自动关闭 Modal
      }}
    >
      <ProFormText
        name="name"
        label="姓名"
        width="md"
        rules={[{ required: true, message: '请输入姓名' }]}
      />
      <ProFormText
        name="email"
        label="邮箱"
        width="md"
        rules={[
          { required: true, message: '请输入邮箱' },
          { type: 'email', message: '邮箱格式不正确' },
        ]}
      />
      <ProFormSelect
        name="role"
        label="角色"
        width="md"
        rules={[{ required: true }]}
        valueEnum={{
          admin: '管理员',
          editor: '编辑',
          viewer: '查看者',
        }}
      />
      <ProFormDatePicker name="joinDate" label="入职日期" width="md" />
      <ProFormTextArea name="remark" label="备注" width="xl" />
    </ModalForm>
  );
};

export default CreateUserModal;
```

### DrawerForm 示例

用法与 ModalForm 几乎完全一致，只是弹出方式从 Modal 变为 Drawer：

```tsx
import React from 'react';
import {
  DrawerForm,
  ProFormText,
  ProFormSelect,
} from '@ant-design/pro-components';
import { Button, message } from 'antd';

const EditUserDrawer: React.FC<{
  record: { id: string; name: string; role: string };
}> = ({ record }) => {
  return (
    <DrawerForm
      title="编辑用户"
      trigger={<Button type="link">编辑</Button>}
      width={480}
      drawerProps={{
        destroyOnClose: true,
      }}
      initialValues={record} // 编辑模式：回填数据
      onFinish={async (values) => {
        await fetch(`/api/users/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        message.success('更新成功');
        return true;
      }}
    >
      <ProFormText name="name" label="姓名" rules={[{ required: true }]} />
      <ProFormSelect
        name="role"
        label="角色"
        valueEnum={{ admin: '管理员', editor: '编辑', viewer: '查看者' }}
      />
    </DrawerForm>
  );
};

export default EditUserDrawer;
```

### ModalForm / DrawerForm 关键 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `trigger` | `ReactNode` | 触发按钮（点击后打开弹窗） |
| `open` | `boolean` | 受控的显隐状态 |
| `onOpenChange` | `(open: boolean) => void` | 显隐变化回调 |
| `modalProps` / `drawerProps` | `ModalProps` / `DrawerProps` | 透传给底层 Modal/Drawer |
| `submitTimeout` | `number` | 提交按钮防重复点击的 loading 时间(ms) |
| `onFinish` | `(values) => Promise<boolean>` | **返回 true 自动关闭**，false 保持打开 |
| `width` | `number \| string` | 弹窗宽度 |
| `title` | `ReactNode` | 标题 |

## StepsForm 分步表单

适用于多步骤向导，每一步有独立校验，步骤之间可传递数据：

```tsx
import React from 'react';
import {
  StepsForm,
  ProFormText,
  ProFormSelect,
  ProFormDigit,
  ProForm,
} from '@ant-design/pro-components';
import { message, Alert, Card } from 'antd';

interface Step1Values {
  payAccount: string;
  receiverAccount: string;
  receiverName: string;
}

interface Step2Values {
  amount: number;
  password: string;
}

const TransferStepsForm: React.FC = () => {
  return (
    <Card>
      <StepsForm
        onFinish={async (values) => {
          // values 是所有步骤的合并值
          console.log('全部步骤数据:', values);
          await fetch('/api/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          });
          message.success('转账提交成功');
          return true;
        }}
        formProps={{
          validateMessages: {
            required: '此项为必填项',
          },
        }}
      >
        {/* 第一步：填写转账信息 */}
        <StepsForm.StepForm<Step1Values>
          name="step1"
          title="填写转账信息"
          onFinish={async (values) => {
            console.log('步骤1:', values);
            return true; // 返回 true 才会进入下一步
          }}
        >
          <ProFormSelect
            name="payAccount"
            label="付款账户"
            width="md"
            rules={[{ required: true }]}
            valueEnum={{
              'account1@bank.com': 'account1@bank.com',
              'account2@bank.com': 'account2@bank.com',
            }}
          />
          <ProForm.Group title="收款信息" size={8}>
            <ProFormText
              name="receiverAccount"
              label="收款账号"
              width="md"
              rules={[{ required: true }]}
              placeholder="请输入收款账号"
            />
            <ProFormText
              name="receiverName"
              label="收款人"
              width="md"
              rules={[{ required: true }]}
            />
          </ProForm.Group>
        </StepsForm.StepForm>

        {/* 第二步：确认并输入密码 */}
        <StepsForm.StepForm<Step2Values>
          name="step2"
          title="确认转账"
          onFinish={async (values) => {
            console.log('步骤2:', values);
            return true;
          }}
        >
          <Alert
            message="确认转账后，资金将直接打入对方账户，无法退回。"
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
          />
          <ProFormDigit
            name="amount"
            label="转账金额"
            width="md"
            rules={[{ required: true }]}
            fieldProps={{ prefix: '¥', precision: 2 }}
          />
          <ProFormText.Password
            name="password"
            label="支付密码"
            width="md"
            rules={[{ required: true, message: '请输入支付密码' }]}
          />
        </StepsForm.StepForm>

        {/* 第三步：结果 */}
        <StepsForm.StepForm name="step3" title="完成">
          <Alert message="转账已提交，预计2小时内到账" type="success" showIcon />
        </StepsForm.StepForm>
      </StepsForm>
    </Card>
  );
};

export default TransferStepsForm;
```

### StepsForm 关键 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `current` | `number` | 受控的当前步骤 |
| `onCurrentChange` | `(current: number) => void` | 步骤变化回调 |
| `onFinish` | `(values) => Promise<boolean>` | 最后一步提交的合并回调 |
| `formProps` | `FormProps` | 透传给每个 StepForm 的 Form |
| `stepsProps` | `StepsProps` | 透传给 antd Steps 组件 |
| `submitter` | `SubmitterProps \| false` | 自定义提交栏 |
| `stepsRender` | `(steps, dom) => ReactNode` | 自定义步骤条渲染 |

**StepsForm.StepForm** 额外 Props：

| Prop | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 步骤标题 |
| `onFinish` | `(values) => Promise<boolean>` | **返回 true 进入下一步**，false 留在当前步 |
| `stepProps` | `StepProps` | 透传给 antd Step |

### StepsForm 放入 Modal

```tsx
<StepsForm
  stepsFormRender={(dom, submitter) => (
    <Modal
      title="分步弹窗"
      open={visible}
      onCancel={() => setVisible(false)}
      footer={submitter}
      width={600}
      destroyOnClose
    >
      {dom}
    </Modal>
  )}
>
  {/* StepForm children ... */}
</StepsForm>
```

## ProFormList 动态列表

用于表单中需要动态增删的子项列表（如联系人列表、规格参数等）：

```tsx
import React from 'react';
import {
  ProForm,
  ProFormList,
  ProFormText,
  ProFormSelect,
  ProFormGroup,
} from '@ant-design/pro-components';
import { message } from 'antd';

interface ContactItem {
  name: string;
  phone: string;
  type: string;
}

interface FormValues {
  projectName: string;
  contacts: ContactItem[];
}

const DynamicListForm: React.FC = () => {
  return (
    <ProForm<FormValues>
      onFinish={async (values) => {
        console.log('表单数据:', values);
        message.success('提交成功');
      }}
    >
      <ProFormText
        name="projectName"
        label="项目名称"
        rules={[{ required: true }]}
      />

      <ProFormList
        name="contacts"
        label="联系人列表"
        creatorButtonProps={{
          creatorButtonText: '添加联系人',
        }}
        min={1} // 最少保留 1 项
        max={5} // 最多 5 项
        copyIconProps={{ tooltipText: '复制此项' }}
        deleteIconProps={{ tooltipText: '删除此项' }}
        initialValue={[
          { name: '', phone: '', type: 'primary' },
        ]}
        itemRender={({ listDom, action }, { record }) => {
          // 可自定义每一行的渲染（默认即可满足大部分需求）
          return (
            <div style={{ display: 'flex', gap: 8 }}>
              {listDom}
              {action}
            </div>
          );
        }}
      >
        <ProFormGroup key="group">
          <ProFormText
            name="name"
            label="姓名"
            rules={[{ required: true }]}
            width="sm"
          />
          <ProFormText
            name="phone"
            label="电话"
            rules={[{ required: true }]}
            width="sm"
          />
          <ProFormSelect
            name="type"
            label="类型"
            width="xs"
            valueEnum={{
              primary: '主要联系人',
              backup: '备用联系人',
            }}
          />
        </ProFormGroup>
      </ProFormList>
    </ProForm>
  );
};

export default DynamicListForm;
```

### ProFormList 关键 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 字段名 |
| `min` | `number` | 最少行数 |
| `max` | `number` | 最多行数 |
| `initialValue` | `any[]` | 初始行数据 |
| `creatorButtonProps` | `ButtonProps & { creatorButtonText }` | 新增按钮配置，设为 `false` 隐藏 |
| `copyIconProps` | `{ Icon, tooltipText } \| false` | 复制图标 |
| `deleteIconProps` | `{ Icon, tooltipText } \| false` | 删除图标 |
| `actionRef` | `MutableRefObject<FormListOperation>` | 操作引用（编程式增删） |
| `itemRender` | `(dom, meta) => ReactNode` | 自定义每行渲染 |
| `creatorRecord` | `Record \| () => Record` | 新增行的默认值 |
| `actionGuard` | `{ beforeAddRow, beforeRemoveRow }` | 增删前的拦截校验 |

**编程式操作**：

```tsx
const actionRef = useRef<FormListOperation>();

// 外部按钮触发新增
<Button onClick={() => actionRef.current?.add({ name: '', phone: '' })}>
  外部添加
</Button>

<ProFormList name="items" actionRef={actionRef}>
  ...
</ProFormList>
```

## 表单布局

### Grid 模式（推荐用于多列表单）

```tsx
<ProForm
  layout="vertical"
  grid={true} // 开启 grid 模式
  rowProps={{ gutter: [16, 0] }}
>
  <ProFormText
    name="name"
    label="姓名"
    colProps={{ xs: 24, md: 12 }} // 响应式栅格
  />
  <ProFormText
    name="email"
    label="邮箱"
    colProps={{ xs: 24, md: 12 }}
  />
  <ProFormTextArea
    name="address"
    label="地址"
    colProps={{ span: 24 }} // 整行
  />
</ProForm>
```

### ProForm.Group 分组

```tsx
<ProForm layout="horizontal">
  <ProForm.Group title="基本信息" collapsible>
    <ProFormText name="name" label="姓名" width="md" />
    <ProFormText name="phone" label="电话" width="md" />
  </ProForm.Group>
  <ProForm.Group title="地址信息" collapsible defaultCollapsed>
    <ProFormText name="province" label="省份" width="sm" />
    <ProFormText name="city" label="城市" width="sm" />
  </ProForm.Group>
</ProForm>
```

### 内联布局（搜索栏场景）

```tsx
<ProForm
  layout="inline"
  submitter={{
    searchConfig: { submitText: '搜索' },
    resetButtonProps: { style: { display: 'none' } },
  }}
  onFinish={async (values) => {
    // 执行搜索
  }}
>
  <ProFormText name="keyword" placeholder="搜索关键词" />
  <ProFormSelect
    name="status"
    placeholder="状态"
    valueEnum={{ active: '激活', inactive: '停用' }}
  />
</ProForm>
```

### 手动栅格（用 antd Row/Col）

用于复杂布局场景，ProForm 字段也可以放在 Row/Col 内：

```tsx
import { Row, Col, Card } from 'antd';

<ProForm layout="vertical" onFinish={onFinish}>
  <Card title="仓库信息">
    <Row gutter={16}>
      <Col lg={6} md={12} sm={24}>
        <ProFormText name="name" label="仓库名" rules={[{ required: true }]} />
      </Col>
      <Col lg={6} md={12} sm={24}>
        <ProFormSelect name="type" label="类型" options={typeOptions} />
      </Col>
      <Col lg={12} sm={24}>
        <ProFormDateRangePicker name="period" label="有效期" />
      </Col>
    </Row>
  </Card>
</ProForm>
```

## 关键 Props 速查

### ProForm 主要 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `onFinish` | `(values) => Promise<void \| boolean>` | - | 提交回调（自动处理 loading） |
| `initialValues` | `Record<string, any>` | - | 初始值 |
| `formRef` | `MutableRefObject<ProFormInstance>` | - | 表单实例引用 |
| `layout` | `'horizontal' \| 'vertical' \| 'inline'` | `'vertical'` | 布局方式 |
| `grid` | `boolean` | `false` | 开启 antd Grid 栅格布局 |
| `rowProps` | `RowProps` | - | grid 模式下的 Row props |
| `submitter` | `SubmitterProps \| false` | 自动渲染 | 提交/重置按钮配置 |
| `onValuesChange` | `(changed, all) => void` | - | 值变化回调 |
| `request` | `(params) => Promise<Values>` | - | 远程加载初始值 |
| `params` | `Record<string, any>` | - | request 的额外参数 |
| `readonly` | `boolean` | `false` | 全局只读模式 |
| `loading` | `boolean` | - | 表单 loading 状态 |

### submitter 配置

```tsx
<ProForm
  submitter={{
    searchConfig: {
      submitText: '保存',   // 提交按钮文字
      resetText: '取消',    // 重置按钮文字
    },
    submitButtonProps: {
      style: { marginLeft: 8 },
    },
    resetButtonProps: false, // 隐藏重置按钮
    render: (props, dom) => {
      // 完全自定义：dom[0] 是重置按钮，dom[1] 是提交按钮
      return <div style={{ textAlign: 'right' }}>{dom}</div>;
    },
  }}
/>
```

### formRef 编程式操作

```tsx
const formRef = useRef<ProFormInstance>();

// 获取值
const values = formRef.current?.getFieldsValue();

// 设置值
formRef.current?.setFieldsValue({ name: '新值' });

// 重置
formRef.current?.resetFields();

// 校验
await formRef.current?.validateFields();

// 提交
formRef.current?.submit();
```

## ProFormDependency 字段联动

当某个字段的值变化时，动态控制其他字段的显隐或选项：

```tsx
<ProFormDependency name={['type']}>
  {({ type }) => {
    if (type === 'personal') {
      return <ProFormText name="idCard" label="身份证号" />;
    }
    if (type === 'company') {
      return <ProFormText name="license" label="营业执照号" />;
    }
    return null;
  }}
</ProFormDependency>
```

**注意**：`name` 数组中的字段名必须与被监听字段的 `name` 一致。支持嵌套路径 `['address', 'province']`。

## 与 ProTable 联动（编辑场景）

ProTable 行内编辑或弹窗编辑的典型模式：

### 模式1：ProTable + ModalForm（弹窗编辑）

```tsx
import React, { useRef, useState } from 'react';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { ProTable, ModalForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import { Button, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

const UserManagement: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const [editRecord, setEditRecord] = useState<UserItem | undefined>();
  const [modalOpen, setModalOpen] = useState(false);

  const columns: ProColumns<UserItem>[] = [
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '角色', dataIndex: 'role', valueEnum: { admin: '管理员', user: '用户' } },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
        <a
          key="edit"
          onClick={() => {
            setEditRecord(record);
            setModalOpen(true);
          }}
        >
          编辑
        </a>,
      ],
    },
  ];

  return (
    <>
      <ProTable<UserItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const res = await fetch(`/api/users?${new URLSearchParams(params as any)}`);
          const data = await res.json();
          return { data: data.list, total: data.total, success: true };
        }}
        rowKey="id"
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditRecord(undefined); // 新建模式
              setModalOpen(true);
            }}
          >
            新建
          </Button>,
        ]}
      />

      <ModalForm<UserItem>
        title={editRecord ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialValues={editRecord}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (editRecord) {
            await fetch(`/api/users/${editRecord.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(values),
            });
          } else {
            await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(values),
            });
          }
          message.success(editRecord ? '更新成功' : '创建成功');
          actionRef.current?.reload(); // 刷新表格
          return true;
        }}
      >
        <ProFormText name="name" label="姓名" rules={[{ required: true }]} />
        <ProFormText name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]} />
        <ProFormSelect
          name="role"
          label="角色"
          valueEnum={{ admin: '管理员', user: '用户' }}
        />
      </ModalForm>
    </>
  );
};

export default UserManagement;
```

### 模式2：ProForm 嵌入 EditableProTable

在 ProForm 内嵌入可编辑表格，表格数据作为表单字段一起提交：

```tsx
import { ProForm, EditableProTable } from '@ant-design/pro-components';
import type { ProColumnType } from '@ant-design/pro-components';

const columns: ProColumnType[] = [
  { title: '姓名', dataIndex: 'name', width: '30%' },
  { title: '工号', dataIndex: 'workId', width: '30%' },
  {
    title: '操作',
    valueType: 'option',
    render: (_, row, _i, action) => [
      <a key="edit" onClick={() => action?.startEditable(row.key)}>编辑</a>,
    ],
  },
];

<ProForm onFinish={async (values) => console.log(values)}>
  <ProForm.Item name="members" trigger="onValuesChange">
    <EditableProTable
      rowKey="key"
      columns={columns}
      recordCreatorProps={{
        record: () => ({ key: Date.now().toString() }),
      }}
    />
  </ProForm.Item>
</ProForm>
```

## 注意事项

1. **onFinish 返回值语义**：ModalForm/DrawerForm 中 `onFinish` 返回 `true` 才会关闭弹窗；StepsForm.StepForm 中返回 `true` 才进入下一步。忘记 `return true` 是最常见的 bug。

2. **destroyOnClose**：ModalForm/DrawerForm 务必设置 `modalProps={{ destroyOnClose: true }}`，否则关闭后重新打开，表单会保留上次的值（即使传了新的 `initialValues`）。

3. **initialValues 不响应更新**：与 antd Form 一致，`initialValues` 只在首次渲染生效。编辑场景需要用 `formRef.current?.setFieldsValue(record)` 或配合 `destroyOnClose` 强制重建。

4. **ProFormSelect 的 request 缓存**：`request` 默认有 SWR 缓存。如果需要每次打开都重新请求，设置 `params` 传入变化值（如 `params={{ t: Date.now() }}`），或使用 `fieldProps.options` 手动控制。

5. **transform 与嵌套字段**：`transform` 可以重命名提交时的字段名：
   ```tsx
   <ProFormDateRangePicker
     name="dateRange"
     transform={(value) => ({
       startDate: value[0],
       endDate: value[1],
     })}
   />
   // 提交时 { startDate: '2024-01-01', endDate: '2024-12-31' }
   ```

6. **宽度预设值**：`width` 的预设值映射 -- `xs: 104px`, `sm: 216px`, `md: 328px`, `lg: 440px`, `xl: 552px`。在 grid 模式下建议用 `colProps` 替代 `width`。

7. **readonly 模式**：设置 `readonly={true}` 后，所有字段变为纯文本展示（不可编辑），适合详情页复用同一份表单代码。

8. **版本注意**：`@ant-design/pro-components` v2.x 要求 `antd >= 5.x`。如果项目还在 antd 4.x，需要用 `@ant-design/pro-form`（已停维）。

## 组合提示

| 搭配组件 | 场景 |
|----------|------|
| `ProTable` | CRUD 页面：表格 + ModalForm 编辑 |
| `PageContainer` | 页面级表单包裹，自带面包屑和标题 |
| `ProCard` | 分区卡片布局（替代 antd Card） |
| `FooterToolbar` | 长表单底部固定提交栏 |
| `EditableProTable` | 表单内嵌可编辑表格 |
| `ProDescriptions` | 详情展示（与 ProForm 共享 valueType 体系） |
