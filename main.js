// Main CRT Filter Application
class CRTFilterApp {
    constructor() {
        this.canvas = document.getElementById('crtCanvas');
        this.video = document.getElementById('sourceVideo');
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        this.program = null;
        this.animationId = null;
        this.isPlaying = false;
        
        this.effects = {
            scanlines: 0.8,
            glow: 0.3,
            curvature: 0.4,
            bleed: 0.2,
            aperture: 0.5,
            bloom: 0.4
        };
        
        this.presets = {
            consumer: { scanlines: 0.8, glow: 0.4, curvature: 0.5, bleed: 0.3, aperture: 0.3, bloom: 0.5 },
            pvm: { scanlines: 0.6, glow: 0.2, curvature: 0.1, bleed: 0.1, aperture: 0.7, bloom: 0.2 },
            arcade: { scanlines: 0.9, glow: 0.5, curvature: 0.6, bleed: 0.4, aperture: 0.4, bloom: 0.6 },
            trinitron: { scanlines: 0.7, glow: 0.3, curvature: 0.2, bleed: 0.2, aperture: 0.8, bloom: 0.3 },
            vga: { scanlines: 0.5, glow: 0.1, curvature: 0.0, bleed: 0.0, aperture: 1.0, bloom: 0.1 }
        };
        
        this.init();
    }
    
    init() {
        this.setupWebGL();
        this.setupEventListeners();
        this.setupVideo();
        this.updateSliders();
        
        // Load default sample
        this.loadSample('retro');
    }
    
    setupWebGL() {
        if (!this.gl) {
            alert('WebGL not supported! Please use a modern browser.');
            return;
        }
        
        // Vertex shader - simple pass-through
        const vsSource = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        // Fragment shader with CRT effects
        const fsSource = `
            precision highp float;
            
            varying vec2 vTexCoord;
            uniform sampler2D uVideoTexture;
            uniform float uScanlines;
            uniform float uGlow;
            uniform float uCurvature;
            uniform float uBleed;
            uniform float uAperture;
            uniform float uBloom;
            uniform vec2 uResolution;
            uniform float uTime;
            
            // Simulate aperture grille or shadow mask
            float maskPattern(vec2 uv, float type) {
                if (type < 0.5) {
                    // Shadow mask (dots)
                    vec2 maskUV = uv * uResolution * 0.5;
                    float mask = sin(maskUV.x * 3.14159) * sin(maskUV.y * 3.14159);
                    return 0.9 + 0.1 * mask;
                } else {
                    // Aperture grille (vertical stripes)
                    float stripe = sin(uv.x * uResolution.x * 3.14159 * 2.0);
                    return 0.85 + 0.15 * stripe;
                }
            }
            
            // Color bleeding effect
            vec3 bleedEffect(vec3 color, vec2 uv, float amount) {
                float bleedDist = 0.003 * amount;
                
                vec3 bleedR = texture2D(uVideoTexture, uv + vec2(bleedDist, 0.0)).rgb;
                vec3 bleedB = texture2D(uVideoTexture, uv - vec2(bleedDist, 0.0)).rgb;
                
                color.r = mix(color.r, bleedR.r, 0.3 * amount);
                color.b = mix(color.b, bleedB.b, 0.3 * amount);
                
                return color;
            }
            
            // Bloom effect
            vec3 bloomEffect(vec3 color, vec2 uv, float amount) {
                if (amount < 0.01) return color;
                
                float bloomSum = 0.0;
                vec3 bloomColor = vec3(0.0);
                int samples = 8;
                
                for (int i = 0; i < samples; i++) {
                    float angle = float(i) * 3.14159 * 2.0 / float(samples);
                    vec2 offset = vec2(cos(angle), sin(angle)) * 0.002 * amount;
                    bloomColor += texture2D(uVideoTexture, uv + offset).rgb;
                }
                bloomColor /= float(samples);
                
                // Only apply bloom to bright areas
                float luminance = dot(color, vec3(0.299, 0.587, 0.114));
                float bloomFactor = smoothstep(0.5, 1.0, luminance) * amount;
                
                return mix(color, bloomColor, bloomFactor);
            }
            
            void main() {
                // Apply screen curvature (barrel distortion)
                vec2 uv = vTexCoord - 0.5;
                float curve = length(uv) * uCurvature;
                uv = uv * (1.0 - curve * curve) + 0.5;
                
                // Clamp to avoid sampling outside texture
                uv = clamp(uv, 0.001, 0.999);
                
                // Sample video texture
                vec4 color = texture2D(uVideoTexture, uv);
                
                // Apply color bleeding
                color.rgb = bleedEffect(color.rgb, uv, uBleed);
                
                // Apply bloom/glow
                color.rgb = bloomEffect(color.rgb, uv, uBloom);
                
                // Add phosphor glow
                color.rgb += color.rgb * uGlow * 0.5;
                
                // Apply scan lines
                float scanline = sin(uv.y * uResolution.y * 3.14159);
                scanline = 0.9 + 0.1 * scanline * uScanlines;
                color.rgb *= scanline;
                
                // Apply aperture/shadow mask
                float mask = maskPattern(uv, uAperture);
                color.rgb *= mask;
                
                // Vignette effect (darker edges)
                float vignette = 1.0 - length(uv - 0.5) * 0.4;
                color.rgb *= vignette;
                
                // Subtle screen noise/flicker
                float noise = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                color.rgb += (noise - 0.5) * 0.01;
                
                gl_FragColor = color;
            }
        `;
        
        // Create shader program
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Shader program error:', this.gl.getProgramInfoLog(this.program));
        }
        
        // Set up geometry (two triangles for full screen quad)
        const positions = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]);
        
        const texCoords = new Float32Array([
            0, 1, 1, 1, 0, 0,
            0, 0, 1, 1, 1, 0
        ]);
        
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        
        const texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
        
        this.gl.useProgram(this.program);
        
        // Set up attribute pointers
        const aPosition = this.gl.getAttribLocation(this.program, 'aPosition');
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.vertexAttribPointer(aPosition, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(aPosition);
        
        const aTexCoord = this.gl.getAttribLocation(this.program, 'aTexCoord');
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
        this.gl.vertexAttribPointer(aTexCoord, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(aTexCoord);
        
        // Create texture for video
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    setupEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const dropZone = document.getElementById('dropZone');
        
        uploadBtn.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.loadVideo(e.target.files[0]);
            }
        });
        
        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#00ccff';
            dropZone.style.transform = 'scale(1.02)';
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '#00ff9d';
            dropZone.style.transform = 'scale(1)';
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#00ff9d';
            dropZone.style.transform = 'scale(1)';
            
            if (e.dataTransfer.files[0]) {
                this.loadVideo(e.dataTransfer.files[0]);
            }
        });
        
        // Sample videos
        document.querySelectorAll('.btn-sample').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sample = e.target.dataset.sample;
                this.loadSample(sample);
            });
        });
        
        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
            });
        });
        
        // Effect sliders
        Object.keys(this.effects).forEach(effect => {
            const slider = document.getElementById(effect);
            const valueSpan = document.getElementById(effect + 'Value');
            
            if (slider) {
                slider.addEventListener('input', (e) => {
                    this.effects[effect] = parseFloat(e.target.value);
                    if (valueSpan) valueSpan.textContent = e.target.value;
                });
            }
        });
        
        // Video controls
        document.getElementById('playBtn').addEventListener('click', () => {
            this.video.play();
            this.isPlaying = true;
            this.render();
        });
        
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.video.pause();
            this.isPlaying = false;
        });
        
        document.getElementById('volume').addEventListener('input', (e) => {
            this.video.volume = e.target.value;
        });
        
        // Update time display
        this.video.addEventListener('timeupdate', () => {
            const current = this.formatTime(this.video.currentTime);
            const duration = this.formatTime(this.video.duration);
            document.getElementById('timeDisplay').textContent = `${current} / ${duration}`;
        });
        
        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // GitHub link
        document.getElementById('githubLink').addEventListener('click', (e) => {
            e.preventDefault();
            alert('GitHub repo would go here!');
        });
    }
    
    setupVideo() {
        this.video.addEventListener('loadedmetadata', () => {
            this.resizeCanvas();
            this.video.play();
            this.isPlaying = true;
            this.render();
        });
        
        this.video.addEventListener('ended', () => {
            this.isPlaying = false;
        });
    }
    
    loadVideo(file) {
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file');
            return;
        }
        
        const url = URL.createObjectURL(file);
        this.video.src = url;
        this.video.load();
        
        // Update UI
        document.querySelector('.upload-area h3').textContent = file.name;
        document.querySelector('.upload-area p').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    }
    
    loadSample(sample) {
        let sampleVideo;
        
        switch(sample) {
            case 'retro':
                sampleVideo = document.getElementById('sampleRetro');
                break;
            case 'game':
                sampleVideo = document.getElementById('sampleGame');
                break;
            case 'test':
                // Create test pattern
                this.createTestPattern();
                return;
        }
        
        this.video.src = sampleVideo.querySelector('source').src;
        this.video.load();
        
        document.querySelector('.upload-area h3').textContent = `Sample: ${sample.charAt(0).toUpperCase() + sample.slice(1)}`;
        document.querySelector('.upload-area p').textContent = 'Click Play to start';
    }
    
    createTestPattern() {
        // Create a synthetic test pattern video
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        
        // Draw test pattern
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        
        // Color bars
        const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#fff'];
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = colors[i];
            ctx.fillRect(i * 90, 0, 90, 100);
        }
        
        // Resolution patterns
        ctx.fillStyle = '#fff';
        ctx.font = '20px monospace';
        ctx.fillText('CRT Test Pattern', 240, 150);
        
        // Grid
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        for (let x = 0; x < 640; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 200);
            ctx.lineTo(x, 400);
            ctx.stroke();
        }
        
        for (let y = 200; y < 400; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(640, y);
            ctx.stroke();
        }
        
        // Create video element from canvas
        const stream = canvas.captureStream(30);
        this.video.srcObject = stream;
        this.video.load();
        
        document.querySelector('.upload-area h3').textContent = 'Test Pattern';
        document.querySelector('.upload-area p').textContent = 'Synthetic pattern for calibration';
    }
    
    applyPreset(presetName) {
        if (this.presets[presetName]) {
            this.effects = { ...this.presets[presetName] };
            this.updateSliders();
        }
    }
    
    updateSliders() {
        Object.keys(this.effects).forEach(effect => {
            const slider = document.getElementById(effect);
            const valueSpan = document.getElementById(effect + 'Value');
            
            if (slider) {
                slider.value = this.effects[effect];
                if (valueSpan) valueSpan.textContent = this.effects[effect].toFixed(2);
            }
        });
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const aspectRatio = this.video.videoWidth / this.video.videoHeight || 16/9;
        
        const maxWidth = container.clientWidth - 20;
        const maxHeight = 500;
        
        let width = maxWidth;
        let height = width / aspectRatio;
        
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    
    render() {
        if (!this.isPlaying || this.video.readyState < 2) {
            this.animationId = requestAnimationFrame(() => this.render());
            return;
        }
        
        this.gl.useProgram(this.program);
        
        // Update video texture
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, this.video);
        
        // Set uniforms
        const resolutionLoc = this.gl.getUniformLocation(this.program, 'uResolution');
        this.gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
        
        const timeLoc = this.gl.getUniformLocation(this.program, 'uTime');
        this.gl.uniform1f(timeLoc, performance.now() / 1000);
        
        // Set effect uniforms
        Object.keys(this.effects).forEach(effect => {
            const loc = this.gl.getUniformLocation(this.program, 'u' + effect.charAt(0).toUpperCase() + effect.slice(1));
            if (loc) {
                this.gl.uniform1f(loc, this.effects[effect]);
            }
        });
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        this.animationId = requestAnimationFrame(() => this.render());
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new CRTFilterApp();
    window.crtApp = app; // Expose for debugging
});