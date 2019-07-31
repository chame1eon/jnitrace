from setuptools import setup, find_packages
from os import path

here = path.abspath(path.dirname(__file__))

with open(path.join(here, 'README.md'), encoding='utf-8') as f:
    long_description = f.read()

setup(
    name='jnitrace',
    version='1.3.4',
    description='A tool for tracing use of the JNI in Android apps',
    long_description=long_description,
    long_description_content_type='text/markdown',
    url='https://github.com/chame1eon/jnitrace',
    author='chame1eon',
    classifiers=[
        'Development Status :: 5 - Production/Stable',

        'Intended Audience :: Developers',

        'Topic :: Software Development :: Debuggers',

        'License :: OSI Approved :: MIT License',

        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
    ],
    keywords='frida jni sre android tracing',
    packages=find_packages(exclude=['contrib', 'docs', 'tests']),
    python_requires='>=3.0, <4',
    install_requires=[
        'frida>=10.0.0',
        'colorama',
        'hexdump'
    ],
    package_data={
        '': ['jnitrace.js'],
    },
    include_package_data=True,
    entry_points={
        'console_scripts': [
            'jnitrace=jnitrace.jnitrace:main',
        ],
    },
    project_urls={
        'Bug Reports': 'https://github.com/chame1eon/jnitrace/issues',
    },
)
