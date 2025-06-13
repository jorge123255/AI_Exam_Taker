const robot = require('robotjs');
const logger = require('./logger');
const config = require('../../config.json');

class ActionExecutor {
    constructor() {
        this.isEnabled = true;
        this.actionDelay = 100; // Default delay between actions in ms
        
        // Configure robotjs
        robot.setMouseDelay(50);
        robot.setKeyboardDelay(50);
        
        logger.info('ActionExecutor initialized');
    }

    async click(x, y, button = 'left') {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Executing click at (${x}, ${y}) with ${button} button`);

            // Move mouse to position
            robot.moveMouse(x, y);
            
            // Small delay to ensure mouse movement is complete
            await this.delay(this.actionDelay);
            
            // Perform click
            robot.mouseClick(button);
            
            // Log the action
            logger.action('click', {
                coordinates: { x, y },
                button,
                timestamp: new Date().toISOString()
            });

            return { success: true, coordinates: { x, y }, button };
        } catch (error) {
            logger.error('Click action failed:', { x, y, button, error: error.message });
            throw error;
        }
    }

    async doubleClick(x, y, button = 'left') {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Executing double-click at (${x}, ${y})`);

            // Move mouse to position
            robot.moveMouse(x, y);
            await this.delay(this.actionDelay);
            
            // Perform double click
            robot.mouseClick(button, true); // true for double click
            
            logger.action('double_click', {
                coordinates: { x, y },
                button,
                timestamp: new Date().toISOString()
            });

            return { success: true, coordinates: { x, y }, button };
        } catch (error) {
            logger.error('Double-click action failed:', { x, y, button, error: error.message });
            throw error;
        }
    }

    async drag(startX, startY, endX, endY) {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Executing drag from (${startX}, ${startY}) to (${endX}, ${endY})`);

            // Move to start position
            robot.moveMouse(startX, startY);
            await this.delay(this.actionDelay);
            
            // Press mouse down
            robot.mouseToggle('down');
            await this.delay(this.actionDelay);
            
            // Drag to end position
            robot.dragMouse(endX, endY);
            await this.delay(this.actionDelay);
            
            // Release mouse
            robot.mouseToggle('up');
            
            logger.action('drag', {
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                timestamp: new Date().toISOString()
            });

            return { 
                success: true, 
                start: { x: startX, y: startY }, 
                end: { x: endX, y: endY } 
            };
        } catch (error) {
            logger.error('Drag action failed:', { 
                startX, startY, endX, endY, 
                error: error.message 
            });
            throw error;
        }
    }

    async type(text, clearFirst = false) {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Typing text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

            // Clear existing text if requested
            if (clearFirst) {
                robot.keyTap('a', 'command'); // Select all (Mac) or use 'control' for Windows/Linux
                await this.delay(this.actionDelay);
            }

            // Type the text
            robot.typeString(text);
            
            logger.action('type', {
                text: text.substring(0, 100), // Log first 100 chars
                textLength: text.length,
                clearFirst,
                timestamp: new Date().toISOString()
            });

            return { success: true, text, length: text.length };
        } catch (error) {
            logger.error('Type action failed:', { text: text.substring(0, 50), error: error.message });
            throw error;
        }
    }

    async keyPress(key, modifiers = []) {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Pressing key: ${key} with modifiers: ${modifiers.join(', ')}`);

            if (modifiers.length > 0) {
                robot.keyTap(key, modifiers);
            } else {
                robot.keyTap(key);
            }
            
            logger.action('key_press', {
                key,
                modifiers,
                timestamp: new Date().toISOString()
            });

            return { success: true, key, modifiers };
        } catch (error) {
            logger.error('Key press action failed:', { key, modifiers, error: error.message });
            throw error;
        }
    }

    async scroll(direction, clicks = 3) {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            logger.info(`Scrolling ${direction} for ${clicks} clicks`);

            const scrollDirection = direction === 'up' ? 'up' : 'down';
            
            for (let i = 0; i < clicks; i++) {
                robot.scrollMouse(0, scrollDirection === 'up' ? -1 : 1);
                await this.delay(50);
            }
            
            logger.action('scroll', {
                direction: scrollDirection,
                clicks,
                timestamp: new Date().toISOString()
            });

            return { success: true, direction: scrollDirection, clicks };
        } catch (error) {
            logger.error('Scroll action failed:', { direction, clicks, error: error.message });
            throw error;
        }
    }

    async moveMouse(x, y) {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            robot.moveMouse(x, y);
            
            logger.debug('Mouse moved', { coordinates: { x, y } });
            return { success: true, coordinates: { x, y } };
        } catch (error) {
            logger.error('Mouse move failed:', { x, y, error: error.message });
            throw error;
        }
    }

    async getMousePosition() {
        try {
            const pos = robot.getMousePos();
            return { x: pos.x, y: pos.y };
        } catch (error) {
            logger.error('Failed to get mouse position:', error);
            throw error;
        }
    }

    async getScreenSize() {
        try {
            const size = robot.getScreenSize();
            return { width: size.width, height: size.height };
        } catch (error) {
            logger.error('Failed to get screen size:', error);
            throw error;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    enable() {
        this.isEnabled = true;
        logger.info('ActionExecutor enabled');
    }

    disable() {
        this.isEnabled = false;
        logger.info('ActionExecutor disabled');
    }

    isActionEnabled() {
        return this.isEnabled;
    }

    setActionDelay(delayMs) {
        this.actionDelay = Math.max(0, delayMs);
        logger.info(`Action delay set to ${this.actionDelay}ms`);
    }

    // Utility method for exam-specific actions
    async clickAnswer(optionData) {
        try {
            const { x, y, identifier, text } = optionData;
            
            logger.info(`Clicking answer option ${identifier}: "${text}"`);
            
            const result = await this.click(x, y);
            
            logger.action('answer_click', {
                option: { identifier, text },
                coordinates: { x, y },
                timestamp: new Date().toISOString()
            });

            return result;
        } catch (error) {
            logger.error('Answer click failed:', { optionData, error: error.message });
            throw error;
        }
    }

    // Method to simulate human-like mouse movement
    async humanLikeClick(x, y, button = 'left') {
        try {
            if (!this.isEnabled) {
                throw new Error('ActionExecutor is disabled');
            }

            // Get current mouse position
            const currentPos = await this.getMousePosition();
            
            // Calculate distance and time for movement
            const distance = Math.sqrt(Math.pow(x - currentPos.x, 2) + Math.pow(y - currentPos.y, 2));
            const moveTime = Math.min(Math.max(distance / 2, 100), 1000); // 100ms to 1000ms based on distance
            
            // Move mouse in a slightly curved path
            const steps = Math.max(5, Math.floor(moveTime / 50));
            
            for (let i = 1; i <= steps; i++) {
                const progress = i / steps;
                const currentX = currentPos.x + (x - currentPos.x) * progress;
                const currentY = currentPos.y + (y - currentPos.y) * progress;
                
                // Add slight randomness to make it more human-like
                const jitterX = (Math.random() - 0.5) * 2;
                const jitterY = (Math.random() - 0.5) * 2;
                
                robot.moveMouse(Math.round(currentX + jitterX), Math.round(currentY + jitterY));
                await this.delay(moveTime / steps);
            }
            
            // Final precise movement to target
            robot.moveMouse(x, y);
            await this.delay(50 + Math.random() * 100); // Random delay before click
            
            // Perform click
            robot.mouseClick(button);
            
            logger.action('human_like_click', {
                coordinates: { x, y },
                button,
                moveTime,
                timestamp: new Date().toISOString()
            });

            return { success: true, coordinates: { x, y }, button, moveTime };
        } catch (error) {
            logger.error('Human-like click failed:', { x, y, button, error: error.message });
            throw error;
        }
    }
}

module.exports = ActionExecutor;