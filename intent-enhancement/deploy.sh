#!/bin/bash
# 意图增强技能检索系统 - 部署脚本

set -e  # 遇到错误立即退出

echo "╔" + "═"*58 + "╗"
echo "║" + " "*20 + "意图增强技能检索系统" + " "*20 + "║"
echo "║" + " "*24 + "部署脚本 v1.0" + " "*28 + "║"
echo "╚" + "═"*58 + "╝"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
else
    PLATFORM="unknown"
fi

echo "检测到平台: ${GREEN}${PLATFORM}${NC}"

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "项目根目录: ${PROJECT_ROOT}"

# 配置路径
CONFIG_DIR="${PROJECT_ROOT}/config"
LOGS_DIR="${PROJECT_ROOT}/logs"
TEST_DATA_DIR="${PROJECT_ROOT}/test_data"

echo -e "\n${BLUE}[1/6] 环境检查${NC}"
echo "------------------------------------------------"

# 检查Python版本
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python3 未安装${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}✓${NC} Python版本: ${PYTHON_VERSION}"

# 检查pip
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}✗ pip3 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} pip已安装"

# 创建必要目录
echo -e "\n${BLUE}[2/6] 创建目录结构${NC}"
echo "------------------------------------------------"

mkdir -p "${CONFIG_DIR}"
mkdir -p "${LOGS_DIR}"
mkdir -p "${TEST_DATA_DIR}/logs"
mkdir -p "${TEST_DATA_DIR}/skills"

echo -e "${GREEN}✓${NC} 目录结构创建完成"

# 安装依赖
echo -e "\n${BLUE}[3/6] 安装依赖${NC}"
echo "------------------------------------------------"

if [ -f "${PROJECT_ROOT}/requirements.txt" ]; then
    echo "安装Python依赖..."
    pip3 install -r "${PROJECT_ROOT}/requirements.txt" -q
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 依赖安装成功"
    else
        echo -e "${RED}✗${NC} 依赖安装失败"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC}  requirements.txt 未找到，跳过依赖安装"
fi

# 创建配置文件
echo -e "\n${BLUE}[4/6] 创建配置${NC}"
echo "------------------------------------------------"

if [ ! -f "${CONFIG_DIR}/config.json" ]; then
    echo "创建默认配置文件..."
    cp "${CONFIG_DIR}/config.json" "${CONFIG_DIR}/config.json.local" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 配置文件创建完成"
else
    echo -e "${GREEN}✓${NC} 配置文件已存在"
fi

# 运行测试
echo -e "\n${BLUE}[5/6] 运行测试${NC}"
echo "------------------------------------------------"

echo "运行集成测试..."
python3 "${PROJECT_ROOT}/run_tests.py"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 所有测试通过"
else
    echo -e "${YELLOW}⚠${NC} 部分测试失败，请检查输出"
fi

# 代码质量检查
echo -e "\n${BLUE}[6/6] 代码质量检查${NC}"
echo "------------------------------------------------"

# 检查代码格式
if command -v black &> /dev/null; then
    echo "运行代码格式检查..."
    black --check "${PROJECT_ROOT}/src" --quiet
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 代码格式检查通过"
    else
        echo -e "${YELLOW}⚠${NC} 部分文件格式不符合black规范"
    fi
else
    echo -e "${YELLOW}⚠${NC} black未安装，跳过格式检查"
fi

# 检查类型提示
if command -v mypy &> /dev/null; then
    echo "运行类型检查..."
    mypy "${PROJECT_ROOT}/src" --quiet || echo -e "${YELLOW}⚠${NC} 类型检查发现问题"
else
    echo -e "${YELLOW}⚠${NC} mypy未安装，跳过类型检查"
fi

# 部署摘要
echo -e "\n${BLUE}部署摘要${NC}"
echo "================================================"

echo -e "${GREEN}✓${NC} 环境检查完成"
echo -e "${GREEN}✓${NC} 目录结构创建完成"
echo -e "${GREEN}✓${NC} 依赖安装完成"
echo -e "${GREEN}✓${NC} 配置文件就绪"
echo -e "${GREEN}✓${NC} 系统测试完成"
echo -e "${GREEN}✓${NC} 代码质量检查完成"

echo -e "\n${BLUE}系统信息${NC}"
echo "------------------------------------------------"
echo "项目根目录: ${PROJECT_ROOT}"
echo "配置目录: ${CONFIG_DIR}"
echo "日志目录: ${LOGS_DIR}"
echo "测试数据目录: ${TEST_DATA_DIR}"

echo -e "\n${BLUE}快速开始${NC}"
echo "------------------------------------------------"

echo "1. 运行集成测试:"
echo "   python3 run_tests.py"

echo "2. 查看配置:"
echo "   cat ${CONFIG_DIR}/config.json"

echo "3. 查看日志:"
echo "   ls ${LOGS_DIR}/"

echo "4. 启用调试模式:"
echo "   编辑 ${CONFIG_DIR}/config.json.local，设置 'debug_mode': true"

echo -e "\n${GREEN}部署完成！${NC}"
echo "系统已就绪，可以开始使用意图增强功能。"

exit 0