---
name: phaser-audio
description: "Phaser 3.90 游戏开发：音频系统。 浏览器安全策略：AudioContext 必须在用户手势（点击/触摸）后才能解锁播放。"
tech_stack: [phaser]
---

# Phaser：音频系统

> 适用版本：Phaser 3.90.0

---

## 核心限制（必读）

**浏览器安全策略：AudioContext 必须在用户手势（点击/触摸）后才能解锁播放。**

```javascript
create() {
  this.bgm = this.sound.add('bgm', { loop: true, volume: 0.5 });

  // 方式一：等待解锁事件
  this.sound.once('unlocked', () => {
    this.bgm.play();
  });

  // 方式二：检查是否已解锁
  if (!this.sound.locked) {
    this.bgm.play();
  }

  // 方式三：绑定到用户点击事件
  this.input.once('pointerdown', () => {
    this.bgm.play();
  });
}
```

---

## 加载音频

```javascript
preload() {
  // 单个音频（提供多格式，浏览器自动选择）
  this.load.audio('bgm', ['assets/music.mp3', 'assets/music.ogg']);
  this.load.audio('jump', 'assets/sfx/jump.wav');
  this.load.audio('coin', 'assets/sfx/coin.mp3');

  // AudioSprite（多个短音效合并到一个文件，减少网络请求）
  this.load.audioSprite('sfx', 'assets/sfx.json', [
    'assets/sfx.mp3',
    'assets/sfx.ogg'
  ]);
}
```

### AudioSprite JSON 格式（assets/sfx.json）

```json
{
  "resources": ["sfx.mp3", "sfx.ogg"],
  "spritemap": {
    "jump":  { "start": 0,   "end": 0.3,  "loop": false },
    "coin":  { "start": 0.5, "end": 0.8,  "loop": false },
    "death": { "start": 1.0, "end": 1.8,  "loop": false },
    "bgm":   { "start": 2.0, "end": 32.0, "loop": true }
  }
}
```

---

## 播放控制

```javascript
// 创建 Sound 对象（推荐，便于后续控制）
const bgm = this.sound.add('bgm', {
  volume: 0.8,    // 0~1
  rate: 1.0,      // 播放速率（0.5=半速, 2=倍速）
  loop: true,
  delay: 0        // 延迟播放（ms）
});

bgm.play();
bgm.stop();
bgm.pause();
bgm.resume();
bgm.destroy();

// 直接播放（一次性音效）
this.sound.play('coin', { volume: 0.6 });
this.sound.play('jump');

// AudioSprite 播放
this.sound.playAudioSprite('sfx', 'jump');
this.sound.playAudioSprite('sfx', 'bgm', { loop: true });
```

---

## 音频属性

```javascript
const sound = this.sound.add('bgm');

sound.volume       // 0~1
sound.rate         // 播放速率
sound.loop         // 是否循环
sound.mute         // 静音状态
sound.pan          // 立体声平移（-1=全左, 0=居中, 1=全右）
sound.isPlaying    // 是否正在播放
sound.isPaused     // 是否暂停
sound.duration     // 总时长（秒）
sound.seek         // 当前播放位置（秒）

// 动态修改
sound.setVolume(0.5);
sound.setRate(1.5);
sound.setMute(true);
sound.setLoop(false);
sound.setSeek(30);    // 跳到第 30 秒
```

---

## 音频事件

```javascript
sound.on('play',     () => { });
sound.on('stop',     () => { });
sound.on('pause',    () => { });
sound.on('resume',   () => { });
sound.on('complete', () => { nextTrack(); });  // 播放完毕
sound.on('looped',   () => { });               // 每次循环时
```

---

## 全局音量控制

```javascript
// 主音量（影响所有音频）
this.sound.volume = 0.5;

// 静音/取消静音
this.sound.mute = true;
this.sound.mute = false;

// 全局播放速率
this.sound.rate = 1.0;

// 暂停/恢复所有音频
this.sound.pauseAll();
this.sound.resumeAll();
this.sound.stopAll();
```

---

## Markers（音频分段）

适合在一个长音频中划分多个逻辑片段（避免加载多个文件）：

```javascript
const music = this.sound.add('bgm');

music.addMarker({ name: 'intro', start: 0,  duration: 8  });
music.addMarker({ name: 'loop',  start: 8,  duration: 60, config: { loop: true } });
music.addMarker({ name: 'end',   start: 68, duration: 5  });

music.playMarker('intro');
music.on('complete', () => music.playMarker('loop'));
```

---

## 音效管理最佳实践

```javascript
class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.sfxVolume = 0.8;
    this.bgmVolume = 0.5;
    this.bgm = null;
  }

  playSFX(key) {
    this.scene.sound.play(key, { volume: this.sfxVolume });
  }

  playBGM(key) {
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
    }
    this.bgm = this.scene.sound.add(key, {
      volume: this.bgmVolume,
      loop: true
    });

    if (!this.scene.sound.locked) {
      this.bgm.play();
    } else {
      this.scene.sound.once('unlocked', () => this.bgm.play());
    }
  }

  setSFXVolume(v) { this.sfxVolume = v; }
  setBGMVolume(v) {
    this.bgmVolume = v;
    if (this.bgm) this.bgm.setVolume(v);
  }
}
```

---

## iOS / 移动端注意事项

```javascript
// iOS 返回页面时 AudioContext 可能暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    this.sound.pauseAll();
  } else {
    this.sound.resumeAll();
  }
});

// 低功耗模式下 iOS 可能自动停止音频
// 建议在 update() 中检测并恢复
update() {
  if (this.bgm && !this.bgm.isPlaying && !this.bgm.isPaused) {
    this.bgm.play();
  }
}
```
